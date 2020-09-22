import { VectorOnchainService } from "@connext/vector-contracts";
import {
  UpdateType,
  InboundChannelUpdateError,
  FullChannelState,
  FullTransferState,
  TransferName,
  Values,
  NetworkContext,
  Result,
  ChannelUpdate,
} from "@connext/vector-types";
import {
  getRandomChannelSigner,
  mkAddress,
  mkHash,
  createTestChannelStateWithSigners,
  createTestChannelUpdateWithSigners,
  createTestUpdateParams,
  PartialUpdateParams,
  PartialFullChannelState,
  PartialChannelUpdate,
  createTestFullLinkedTransferState,
  ChannelSigner,
} from "@connext/vector-utils";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { MerkleTree } from "merkletreejs";
import Sinon from "sinon";

import * as vectorUpdate from "../update";

// import { applyUpdate, generateUpdate } from "../update";

import { MemoryStoreService } from "./services/store";
import { env } from "./utils";

type ApplyUpdateTestParams = {
  name: string;
  updateType: UpdateType;
  stateOverrides?: PartialFullChannelState<any>;
  updateOverrides?: PartialChannelUpdate<any>;
  transferOverrides?: Partial<FullTransferState<typeof TransferName.LinkedTransfer>>;
  expected?: Partial<FullChannelState<any>>;
  error?: Values<typeof InboundChannelUpdateError.reasons>;
};

describe("applyUpdate", () => {
  const chainId = parseInt(Object.keys(env.chainProviders)[0]);
  const providerUrl = env.chainProviders[chainId];
  const signers = Array(2)
    .fill(0)
    .map(() => getRandomChannelSigner(providerUrl));

  // Generate test constants
  const participants = signers.map((s) => s.address);
  const publicIdentifiers = signers.map((s) => s.publicIdentifier);
  const channelAddress = mkAddress("0xccc");
  const networkContext: NetworkContext = {
    chainId,
    providerUrl,
    adjudicatorAddress: mkAddress("0xaaabbbcccc"),
    channelFactoryAddress: mkAddress("0xddddeeeffff"),
    vectorChannelMastercopyAddress: mkAddress("0xbeef"),
  };
  const merkleProofData = [mkHash("0xproof")];
  const merkleRoot = mkHash("0xroot");

  afterEach(() => {
    Sinon.restore();
  });

  const tests: ApplyUpdateTestParams[] = [
    {
      name: "should work for setup",
      updateType: UpdateType.setup,
      stateOverrides: {
        nonce: 0,
      },
      updateOverrides: {
        details: { counterpartyIdentifier: publicIdentifiers[1], networkContext, timeout: "8267345" },
        nonce: 1,
      },
      expected: {
        timeout: "8267345",
        latestDepositNonce: 0,
        balances: [],
        lockedBalance: [],
        assetIds: [],
        merkleRoot: mkHash(),
      },
    },
    {
      name: "should work for deposit (adding new assetId)",
      updateType: UpdateType.deposit,
      stateOverrides: {
        nonce: 1,
        balances: [],
        assetIds: [],
        lockedBalance: [],
        latestDepositNonce: 0,
      },
      updateOverrides: {
        details: { latestDepositNonce: 0 },
        nonce: 2,
        balance: { to: participants, amount: ["0", "17"] },
        assetId: mkAddress("0xaddee"),
      },
      expected: {
        latestDepositNonce: 0,
        balances: [{ to: participants, amount: ["0", "17"] }],
        lockedBalance: [],
        assetIds: [mkAddress("0xaddee")],
      },
    },
    {
      name: "should work for deposit (existing assetId)",
      updateType: UpdateType.deposit,
      stateOverrides: {
        nonce: 5,
        balances: [{ to: participants, amount: ["0", "17"] }],
        assetIds: [mkAddress()],
        lockedBalance: [],
        latestDepositNonce: 0,
      },
      updateOverrides: {
        details: { latestDepositNonce: 3 },
        nonce: 6,
        balance: { to: participants, amount: ["6", "17"] },
        assetId: mkAddress("0xaddee"),
      },
      expected: {
        latestDepositNonce: 3,
        balances: [
          { to: participants, amount: ["0", "17"] },
          { to: participants, amount: ["6", "17"] },
        ],
        lockedBalance: [],
        assetIds: [mkAddress(), mkAddress("0xaddee")],
      },
    },
    {
      name: "should work for create (bob creates)",
      updateType: UpdateType.create,
      stateOverrides: {
        nonce: 5,
        balances: [{ to: participants, amount: ["43", "22"] }],
        assetIds: [mkAddress()],
        lockedBalance: [],
        merkleRoot: mkHash(),
      },
      updateOverrides: {
        balance: { to: participants, amount: ["43", "8"] },
        fromIdentifier: publicIdentifiers[1],
        toIdentifier: publicIdentifiers[0],
        assetId: mkAddress(),
      },
      transferOverrides: {
        initialBalance: { to: participants, amount: ["0", "14"] },
        assetId: mkAddress(),
      },
      expected: {
        balances: [{ to: participants, amount: ["43", "8"] }],
        lockedBalance: ["14"],
        assetIds: [mkAddress()],
        merkleRoot,
      },
    },
    {
      name: "should work for create (alice creates)",
      updateType: UpdateType.create,
      stateOverrides: {
        nonce: 5,
        balances: [{ to: participants, amount: ["43", "22"] }],
        assetIds: [mkAddress()],
        lockedBalance: [],
        merkleRoot: mkHash(),
      },
      updateOverrides: {
        balance: { to: participants, amount: ["29", "22"] },
        fromIdentifier: publicIdentifiers[0],
        toIdentifier: publicIdentifiers[1],
        assetId: mkAddress(),
      },
      transferOverrides: {
        initialBalance: { to: participants, amount: ["14", "0"] },
        assetId: mkAddress(),
      },
      expected: {
        balances: [{ to: participants, amount: ["29", "22"] }],
        lockedBalance: ["14"],
        assetIds: [mkAddress()],
        merkleRoot,
      },
    },
    {
      name: "should work for create when transfer does not include state participants",
      updateType: UpdateType.create,
      stateOverrides: {
        nonce: 5,
        balances: [{ to: participants, amount: ["43", "22"] }],
        assetIds: [mkAddress()],
        lockedBalance: [],
        merkleRoot: mkHash(),
      },
      updateOverrides: {
        balance: { to: participants, amount: ["29", "22"] },
        assetId: mkAddress(),
      },
      transferOverrides: {
        initialBalance: { to: [mkAddress("0xffff"), participants[1]], amount: ["14", "0"] },
        assetId: mkAddress(),
      },
      expected: {
        balances: [{ to: participants, amount: ["29", "22"] }],
        lockedBalance: ["14"],
        assetIds: [mkAddress()],
        merkleRoot,
      },
    },
    {
      name: "should work for resolve (bob resolves)",
      updateType: UpdateType.resolve,
      stateOverrides: {
        nonce: 5,
        balances: [{ to: participants, amount: ["3", "4"] }],
        assetIds: [mkAddress()],
        lockedBalance: ["8"],
        merkleRoot,
      },
      updateOverrides: {
        balance: { to: participants, amount: ["3", "12"] },
        fromIdentifier: publicIdentifiers[1],
        toIdentifier: publicIdentifiers[0],
        assetId: mkAddress(),
      },
      transferOverrides: {
        initialBalance: { to: participants, amount: ["0", "8"] },
        assetId: mkAddress(),
      },
      expected: {
        balances: [{ to: participants, amount: ["3", "12"] }],
        lockedBalance: [],
        assetIds: [mkAddress()],
        merkleRoot: mkHash(),
      },
    },
    {
      name: "should work for resolve (alice resolves)",
      updateType: UpdateType.resolve,
      stateOverrides: {
        nonce: 5,
        balances: [{ to: participants, amount: ["13", "2"] }],
        assetIds: [mkAddress()],
        lockedBalance: ["9"],
        merkleRoot,
      },
      updateOverrides: {
        balance: { to: participants, amount: ["22", "2"] },
        fromIdentifier: publicIdentifiers[0],
        toIdentifier: publicIdentifiers[1],
        assetId: mkAddress(),
      },
      transferOverrides: {
        initialBalance: { to: participants, amount: ["9", "0"] },
        assetId: mkAddress(),
      },
      expected: {
        balances: [{ to: participants, amount: ["22", "2"] }],
        lockedBalance: [],
        assetIds: [mkAddress()],
        merkleRoot: mkHash(),
      },
    },
    {
      name: "should work for resolve when transfer does not include state participants",
      updateType: UpdateType.resolve,
      stateOverrides: {
        nonce: 5,
        balances: [{ to: participants, amount: ["7", "22"] }],
        assetIds: [mkAddress()],
        lockedBalance: ["14"],
        merkleRoot,
      },
      updateOverrides: {
        balance: { to: participants, amount: ["7", "22"] },
        assetId: mkAddress(),
      },
      transferOverrides: {
        initialBalance: { to: [mkAddress("0xffff"), participants[1]], amount: ["14", "0"] },
        assetId: mkAddress(),
      },
      expected: {
        balances: [{ to: participants, amount: ["7", "22"] }],
        lockedBalance: [],
        assetIds: [mkAddress()],
        merkleRoot: mkHash(),
      },
    },
    {
      name: "should fail for an unrecognized update type",
      updateType: ("fail" as unknown) as UpdateType,
      error: InboundChannelUpdateError.reasons.BadUpdateType,
    },
  ];

  for (const test of tests) {
    const { name, updateType, stateOverrides, updateOverrides, transferOverrides, error, expected } = test;

    it(name, async () => {
      // Generate the previous state
      const previousState = createTestChannelStateWithSigners(
        signers,
        stateOverrides?.latestUpdate?.type ?? UpdateType.setup,
        { channelAddress, networkContext, ...stateOverrides },
      );

      // Generate the transfer (if needed)
      let transfer: FullTransferState | undefined = undefined;
      if (updateType === UpdateType.resolve || updateType === UpdateType.create) {
        // Create the full transfer state
        transfer = {
          ...createTestFullLinkedTransferState({
            balance: transferOverrides?.initialBalance,
            assetId: transferOverrides?.assetId ?? mkAddress(),
          }),
          ...transferOverrides,
        };
      }

      // Generate the update using sensible defaults from transfers
      const overrides: any = { channelAddress, nonce: previousState.nonce + 1 };
      if (updateType === UpdateType.create && transfer) {
        // mock out merkle tree
        Sinon.createStubInstance(MerkleTree, {
          getHexProof: merkleProofData,
          getHexRoot: merkleRoot,
        } as any);
        const { transferResolver, transferState, ...createDetails } = transfer;
        overrides.details = {
          ...createDetails,
          transferInitialState: transferState,
          merkleProofData,
          merkleRoot,
        };
      } else if (updateType === UpdateType.resolve && transfer) {
        Sinon.createStubInstance(MerkleTree, {
          getHexRoot: mkHash(),
        } as any);
        const { transferTimeout, transferState, ...resolveDetails } = transfer;
        overrides.details = {
          ...resolveDetails,
          merkleRoot: mkHash(),
        };
      }
      // Make sure update has correct transfer details
      const update = createTestChannelUpdateWithSigners(signers, updateType, {
        ...overrides,
        ...updateOverrides,
      });

      // Call `applyUpdate`
      const result = await vectorUpdate.applyUpdate(update, previousState, transfer);

      // Verify result
      if (error) {
        expect(result.getError()?.message).to.be.eq(error);
      } else if (expected) {
        expect(result.getError()).to.be.undefined;
        expect(result.getValue()).to.containSubset({
          channelAddress,
          publicIdentifiers,
          participants,
          latestUpdate: update,
          nonce: previousState.nonce + 1,
          networkContext,
          ...expected,
        });
      } else {
        expect(false).to.be.eq("Neither error or expected result provided in test");
      }
    });
  }
});

type GenerateUpdateTestParams = {
  name: string;
  updateType: UpdateType;
  stateOverrides?: PartialFullChannelState<any>;
  paramOverrides?: PartialUpdateParams<any>;
  expectedUpdate?: Partial<ChannelUpdate<any>>;
  expectedTransfer?: Partial<FullTransferState<typeof TransferName.LinkedTransfer>>;
  error?: Values<typeof InboundChannelUpdateError.reasons>;
  from?: ChannelSigner;

  // Mock values
  storedChannel?: PartialFullChannelState<any>;
  onchainBalance?: BigNumber;
  depositA?: { nonce: BigNumber; amount: BigNumber };
};

describe.only("generateUpdate", () => {
  // Get channel constants
  const chainId = parseInt(Object.keys(env.chainProviders)[0]);
  const providerUrl = env.chainProviders[chainId];
  const signers = Array(2)
    .fill(0)
    .map(() => getRandomChannelSigner(providerUrl));
  const participants = signers.map((s) => s.address);
  const publicIdentifiers = signers.map((s) => s.publicIdentifier);
  const channelAddress = mkAddress("0xccc");
  const networkContext: NetworkContext = {
    chainId,
    providerUrl,
    adjudicatorAddress: mkAddress("0xaaabbbcccc"),
    channelFactoryAddress: mkAddress("0xddddeeeffff"),
    vectorChannelMastercopyAddress: mkAddress("0xbeef"),
  };

  // // Get transfer constants
  // const preImage = getRandomBytes32();
  // const transferDefinition = env.chainAddresses[chainId].LinkedTransfer.address;
  // const transferEncodings = [LinkedTransferStateEncoding, LinkedTransferResolverEncoding];
  // const linkedHash = createLinkedHash(preImage);
  // const transferMeta = { super: "cool" };
  // const transferInitialBalance = { to: participants, amount: ["3", "0"] };
  // const initialState = createTestLinkedTransferState({
  //   linkedHash,
  //   balance: transferInitialBalance,
  // });
  // const initialFullTransfer = createTestFullLinkedTransferState({
  //   channelAddress,
  //   preImage,
  //   balance: transferInitialBalance,
  //   initialBalance: transferInitialBalance,
  //   initialStateHash: hashTransferState(initialState, transferEncodings[0]),
  // });
  // const merkleProofData = [mkHash("0xproof")];
  // const merkleRoot = mkHash("0xroot");

  // Declare mocks
  let store: Sinon.SinonStubbedInstance<MemoryStoreService>;
  let chainService: Sinon.SinonStubbedInstance<VectorOnchainService>;

  afterEach(() => {
    Sinon.restore();
  });

  beforeEach(async () => {
    store = Sinon.createStubInstance(MemoryStoreService);
    chainService = Sinon.createStubInstance(VectorOnchainService);

    // Mock `applyUpdate` (tested above) so it always returns
    // an empty object
    Sinon.stub(vectorUpdate, "applyUpdate").resolves(Result.ok({} as any));
  });

  const tests: GenerateUpdateTestParams[] = [
    {
      name: "should work for setup",
      updateType: UpdateType.setup,
      paramOverrides: {
        details: {
          counterpartyIdentifier: publicIdentifiers[1],
          timeout: "1023497",
          networkContext,
        },
      },
      stateOverrides: {
        assetIds: [],
        balances: [],
        lockedBalance: [],
        merkleRoot: mkHash(),
        nonce: 0,
        timeout: "0",
        latestUpdate: {} as any, // There is no latest update on setup
        latestDepositNonce: 0,
      },
      expectedUpdate: {
        nonce: 1,
        // should have the to field filled out
        balance: { to: participants, amount: ["0", "0"] },
        details: {
          networkContext,
          timeout: "1023497",
        },
        assetId: mkAddress(),
      },
    },
    {
      name: "should work for bob deposit",
      updateType: UpdateType.deposit,
      paramOverrides: {
        details: {
          assetId: mkAddress(),
        },
      },
      stateOverrides: {
        assetIds: [],
        balances: [],
        lockedBalance: [],
        merkleRoot: mkHash(),
        nonce: 1,
        latestDepositNonce: 0,
      },
      expectedUpdate: {
        nonce: 2,
        assetId: mkAddress(),
        balance: { to: participants, amount: ["0", "10"] },
        details: { latestDepositNonce: 0 },
      },
      onchainBalance: BigNumber.from(10),
      from: signers[1],
    },
    {
      name: "should work for alice deposit",
      updateType: UpdateType.deposit,
      paramOverrides: {
        details: {
          assetId: mkAddress(),
        },
      },
      stateOverrides: {
        assetIds: [],
        balances: [],
        lockedBalance: [],
        merkleRoot: mkHash(),
        nonce: 1,
        latestDepositNonce: 0,
      },
      expectedUpdate: {
        nonce: 2,
        assetId: mkAddress(),
        balance: { to: participants, amount: ["10", "0"] },
        details: { latestDepositNonce: 1 },
      },
      onchainBalance: BigNumber.from(10),
      depositA: { nonce: BigNumber.from(1), amount: BigNumber.from(10) },
    },
    // {
    //   name: "should work for create",
    //   updateType: UpdateType.resolve,
    //   paramOverrides: {},
    //   stateOverrides: {},
    //   expectedUpdate: {},
    //   expectedTransfer: {},
    // },
    // {
    //   name: "should work for resolve",
    //   updateType: UpdateType.resolve,
    //   paramOverrides: {},
    //   stateOverrides: {},
    //   expectedUpdate: {},
    //   expectedTransfer: {},
    // },
  ];

  for (const test of tests) {
    const {
      name,
      updateType,
      stateOverrides,
      paramOverrides,
      expectedUpdate,
      error,
      expectedTransfer,
      storedChannel,
      onchainBalance,
      depositA,
      from,
    } = test;

    it(name, async () => {
      // TODO: handle transfers first!

      // Generate the params
      const params = createTestUpdateParams(updateType, { channelAddress, ...paramOverrides });

      // Generate the state
      const state = createTestChannelStateWithSigners(signers, UpdateType.setup, {
        channelAddress,
        participants,
        networkContext,
        publicIdentifiers,
        ...stateOverrides,
      });

      // Set the mocks
      const inStore = !!storedChannel
        ? createTestChannelStateWithSigners(signers, UpdateType.setup, {
            channelAddress,
            participants,
            networkContext,
            publicIdentifiers,
            ...storedChannel,
          })
        : state;
      store.getChannelState.resolves(inStore);
      // store.getTransferState.resolves(transfer);
      // store.getActiveTransfers.resolves([transfer?.transferState].filter((x) => !!x) as any);
      // Chain service mocks are only used by deposit/resolve
      chainService.getLatestDepositByAssetId.resolves(
        Result.ok(depositA ?? { nonce: BigNumber.from(0), amount: BigNumber.from(0) }),
      );
      chainService.getChannelOnchainBalance.resolves(Result.ok(onchainBalance ?? BigNumber.from(0)));

      // Execute function call
      const result = await vectorUpdate.generateUpdate(params, state, store, chainService, from ?? signers[0]);

      // Verify result
      if (error) {
        expect(result.getError()?.message).to.be.eq(error);
      } else if (expectedUpdate) {
        expect(result.getError()).to.be.undefined;
        const { update, transfer } = result.getValue()!;

        // Verify expected update
        const expected = createTestChannelUpdateWithSigners(signers, updateType, {
          channelAddress,
          type: updateType,
          fromIdentifier: from?.publicIdentifier ?? publicIdentifiers[0],
          toIdentifier:
            from?.publicIdentifier && from?.publicIdentifier === publicIdentifiers[1]
              ? publicIdentifiers[0]
              : publicIdentifiers[1],
          ...expectedUpdate,
        });
        // Dont compare signatures
        const { signatures, ...unsigned } = expected;
        // Dont compare transferIds or merkleRoot
        expect(update).to.containSubset({
          ...unsigned,
        });

        // Verify transfer
        expect(transfer).to.containSubset(expectedTransfer);

        // Verify update initiator added sigs
        expect(
          from?.publicIdentifier && from?.publicIdentifier == publicIdentifiers[1]
            ? update.signatures[1]
            : update.signatures[0],
        ).to.be.ok;
        expect(
          from?.publicIdentifier && from?.publicIdentifier == publicIdentifiers[1]
            ? update.signatures[0]
            : update.signatures[1],
        ).to.not.be.ok;
      } else {
        expect(false).to.be.eq("Neither error or expected result provided in test");
      }
    });
  }
});
