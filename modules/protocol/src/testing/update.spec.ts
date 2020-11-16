/* eslint-disable @typescript-eslint/no-empty-function */
import { VectorChainReader } from "@connext/vector-contracts";
import {
  UpdateType,
  InboundChannelUpdateError,
  FullChannelState,
  FullTransferState,
  Values,
  NetworkContext,
  Result,
  Balance,
  HashlockTransferStateEncoding,
  HashlockTransferResolverEncoding,
  IChannelSigner,
  UpdateParams,
} from "@connext/vector-types";
import {
  getRandomChannelSigner,
  mkAddress,
  mkHash,
  createTestChannelStateWithSigners,
  createTestChannelUpdateWithSigners,
  createTestUpdateParams,
  PartialFullChannelState,
  PartialChannelUpdate,
  createTestFullHashlockTransferState,
  expect,
  getSignerAddressFromPublicIdentifier,
  stringify,
  getTestLoggers,
  getTransferId,
  createTestHashlockTransferState,
} from "@connext/vector-utils";
import { BigNumber } from "ethers";
import Sinon from "sinon";

import * as vectorUpdate from "../update";
import * as vectorUtils from "../utils";

import { env } from "./env";

type ApplyUpdateTestParams<T extends UpdateType = any> = {
  name: string;
  updateType: T;
  updateOverrides?: PartialChannelUpdate<T>;
  stateOverrides?: PartialFullChannelState<any>;
  activeTransfersOverrides?: Partial<FullTransferState>[];
  finalBalanceOverrides?: Balance;
  expected?: Partial<{
    channel: Partial<FullChannelState>;
    activeTransfers: Partial<FullTransferState>[];
    transfer?: Partial<FullTransferState>;
  }>;
  error?: Values<typeof InboundChannelUpdateError.reasons>;
};

describe("applyUpdate", () => {
  const chainId = parseInt(Object.keys(env.chainProviders)[0]);
  const providerUrl = env.chainProviders[chainId];
  const signers = Array(2)
    .fill(0)
    .map(() => getRandomChannelSigner(providerUrl));

  // Generate test constants
  const participants = signers.map(s => s.address);
  const publicIdentifiers = signers.map(s => s.publicIdentifier);
  const channelAddress = mkAddress("0xccc");
  const networkContext: NetworkContext = {
    chainId,
    providerUrl,
    channelFactoryAddress: mkAddress("0xaaabbbcccc"),
    transferRegistryAddress: mkAddress("0xddddeeeeefffff44444"),
  };

  // Sample transfer (alice creating, bob recieving)
  const transferAmount = "7";
  const sampleResolvedTransfer = createTestFullHashlockTransferState({
    initiator: participants[0],
    responder: participants[1],
    balance: { to: participants, amount: ["0", transferAmount.toString()] },
    chainId,
    channelFactoryAddress: mkAddress("0xaaabbbcccc"),
  });
  const sampleCreatedTransfer = {
    ...sampleResolvedTransfer,
    transferState: {
      ...sampleResolvedTransfer.transferState,
      balance: { to: participants, amount: [transferAmount.toString(), "0"] },
    },
    transferResolver: undefined,
  };

  afterEach(() => {
    Sinon.restore();
  });

  const tests: ApplyUpdateTestParams[] = [
    {
      name: "should work for setup",
      updateType: UpdateType.setup,
      updateOverrides: {
        details: { counterpartyIdentifier: publicIdentifiers[1], networkContext, timeout: "8267345" },
        nonce: 1,
      },
      expected: {
        channel: {
          timeout: "8267345",
          balances: [],
          processedDepositsA: [],
          processedDepositsB: [],
          assetIds: [],
          merkleRoot: mkHash(),
        },
        activeTransfers: [],
      },
    },
    {
      name: "should work for deposit (adding new assetId)",
      updateType: UpdateType.deposit,
      stateOverrides: {
        nonce: 1,
        balances: [],
        assetIds: [],
        processedDepositsA: [],
        processedDepositsB: [],
      },
      updateOverrides: {
        details: { totalDepositsAlice: "5", totalDepositsBob: "12" },
        nonce: 2,
        balance: { to: participants, amount: ["0", "17"] },
        assetId: mkAddress("0xaddee"),
      },
      expected: {
        channel: {
          balances: [{ to: participants, amount: ["0", "17"] }],
          processedDepositsA: ["5"],
          processedDepositsB: ["12"],
          assetIds: [mkAddress("0xaddee")],
        },
        activeTransfers: [],
      },
    },
    {
      name: "should work for deposit (existing assetId)",
      updateType: UpdateType.deposit,
      stateOverrides: {
        nonce: 15,
        balances: [
          { to: participants, amount: ["0", "17"] },
          { to: participants, amount: ["10", "1"] },
          { to: participants, amount: ["4", "7"] },
        ],
        assetIds: [mkAddress(), mkAddress("0xfed"), mkAddress("0xasdf")],
        processedDepositsA: ["0", "10", "1"],
        processedDepositsB: ["5", "7", "9"],
      },
      updateOverrides: {
        details: { totalDepositsAlice: "12", totalDepositsBob: "7" },
        nonce: 16,
        balance: { to: participants, amount: ["16", "17"] },
        assetId: mkAddress("0xfed"),
      },
      expected: {
        channel: {
          nonce: 16,
          balances: [
            { to: participants, amount: ["0", "17"] },
            { to: participants, amount: ["16", "17"] },
            { to: participants, amount: ["4", "7"] },
          ],
          assetIds: [mkAddress(), mkAddress("0xfed"), mkAddress("0xasdf")],
          processedDepositsA: ["0", "12", "1"],
          processedDepositsB: ["5", "7", "9"],
        },
        activeTransfers: [],
      },
    },
    {
      name: "should work for create (bob creates)",
      updateType: UpdateType.create,
      stateOverrides: {
        nonce: 5,
        balances: [
          { to: participants, amount: ["43", "22"] },
          { to: participants, amount: ["13", "6"] },
          { to: participants, amount: ["4", "2"] },
        ],
        assetIds: [mkAddress(), mkAddress("0xdeffff"), mkAddress("0xasdf")],
        processedDepositsA: ["0", "12", "1"],
        processedDepositsB: ["5", "7", "9"],
        merkleRoot: mkHash("0xafeb"),
      },
      updateOverrides: {
        nonce: 6,
        balance: { to: participants, amount: ["13", "2"] },
        fromIdentifier: publicIdentifiers[1],
        toIdentifier: publicIdentifiers[0],
        assetId: mkAddress("0xdeffff"),
        details: {
          balance: { ...sampleCreatedTransfer.balance, to: [participants[1], participants[0]] },
          transferId: sampleCreatedTransfer.transferId,
          transferDefinition: sampleCreatedTransfer.transferDefinition,
          transferTimeout: sampleCreatedTransfer.transferTimeout,
          transferEncodings: sampleCreatedTransfer.transferEncodings,
          transferInitialState: sampleCreatedTransfer.transferState,
          meta: { testing: "is ok sometimes" },
        },
      },
      expected: {
        channel: {
          nonce: 6,
          balances: [
            { to: participants, amount: ["43", "22"] },
            { to: participants, amount: ["13", "2"] },
            { to: participants, amount: ["4", "2"] },
          ],
          processedDepositsA: ["0", "12", "1"],
          processedDepositsB: ["5", "7", "9"],
          assetIds: [mkAddress(), mkAddress("0xdeffff"), mkAddress("0xasdf")],
        },
        activeTransfers: [{ ...sampleCreatedTransfer, meta: { testing: "is ok sometimes" } }],
        transfer: { ...sampleCreatedTransfer, meta: { testing: "is ok sometimes" } },
      },
    },
    {
      name: "should work for create (alice creates)",
      updateType: UpdateType.create,
      stateOverrides: {
        nonce: 5,
        balances: [{ to: participants, amount: ["43", "22"] }],
        assetIds: [mkAddress()],
        processedDepositsA: ["5"],
        processedDepositsB: ["12"],
        merkleRoot: mkHash(),
      },
      updateOverrides: {
        balance: { to: participants, amount: ["29", "22"] },
        fromIdentifier: publicIdentifiers[0],
        toIdentifier: publicIdentifiers[1],
        assetId: mkAddress(),
        details: {
          transferId: sampleCreatedTransfer.transferId,
          transferDefinition: sampleCreatedTransfer.transferDefinition,
          transferTimeout: sampleCreatedTransfer.transferTimeout,
          transferEncodings: sampleCreatedTransfer.transferEncodings,
          transferInitialState: sampleCreatedTransfer.transferState,
          balance: sampleCreatedTransfer.balance,
          meta: { testing: "is fine i guess" },
        },
      },
      expected: {
        channel: {
          balances: [{ to: participants, amount: ["29", "22"] }],
          processedDepositsA: ["5"],
          processedDepositsB: ["12"],
          assetIds: [mkAddress()],
        },
        activeTransfers: [
          {
            ...sampleCreatedTransfer,
            initiator: participants[1],
            responder: participants[0],
            meta: { testing: "is fine i guess" },
          },
        ],
        transfer: {
          ...sampleCreatedTransfer,
          initiator: participants[1],
          responder: participants[0],
          meta: { testing: "is fine i guess" },
        },
      },
    },
    {
      name: "should work for resolve (bob resolves)",
      updateType: UpdateType.resolve,
      stateOverrides: {
        nonce: 5,
        balances: [{ to: participants, amount: ["3", "4"] }],
        assetIds: [mkAddress()],
        processedDepositsA: ["5"],
        processedDepositsB: ["12"],
      },
      updateOverrides: {
        balance: { to: participants, amount: ["3", "12"] },
        fromIdentifier: publicIdentifiers[1],
        toIdentifier: publicIdentifiers[0],
        assetId: mkAddress(),
        details: {
          transferId: sampleCreatedTransfer.transferId,
        },
      },
      activeTransfersOverrides: [sampleCreatedTransfer],
      finalBalanceOverrides: sampleResolvedTransfer.balance,
      expected: {
        channel: {
          balances: [{ to: participants, amount: ["3", "12"] }],
          processedDepositsA: ["5"],
          processedDepositsB: ["12"],
          assetIds: [mkAddress()],
        },
        activeTransfers: [],
        transfer: {
          ...sampleCreatedTransfer,
          transferResolver: sampleResolvedTransfer.transferResolver,
          transferState: sampleResolvedTransfer.transferState,
        },
      },
    },
    {
      name: "should work for resolve (alice resolves)",
      updateType: UpdateType.resolve,
      stateOverrides: {
        nonce: 5,
        balances: [{ to: participants, amount: ["13", "2"] }],
        assetIds: [mkAddress()],
        processedDepositsA: ["5"],
        processedDepositsB: ["12"],
      },
      updateOverrides: {
        balance: { to: participants, amount: ["22", "2"] },
        fromIdentifier: publicIdentifiers[0],
        toIdentifier: publicIdentifiers[1],
        assetId: mkAddress(),
        details: {
          transferId: sampleCreatedTransfer.transferId,
          transferResolver: sampleResolvedTransfer.transferResolver,
        },
      },
      activeTransfersOverrides: [sampleCreatedTransfer],
      finalBalanceOverrides: sampleResolvedTransfer.balance,
      expected: {
        channel: {
          balances: [{ to: participants, amount: ["22", "2"] }],
          processedDepositsA: ["5"],
          processedDepositsB: ["12"],
          assetIds: [mkAddress()],
        },
        activeTransfers: [],
        transfer: {
          ...sampleCreatedTransfer,
          transferResolver: sampleResolvedTransfer.transferResolver,
          transferState: sampleResolvedTransfer.transferState,
        },
      },
    },
    {
      name: "should fail for an unrecognized update type",
      updateType: ("fail" as unknown) as UpdateType,
      error: InboundChannelUpdateError.reasons.BadUpdateType,
    },
    {
      name: "should fail for `resolve` if there is no transfer balance",
      updateType: UpdateType.resolve,
      error: InboundChannelUpdateError.reasons.ApplyUpdateFailed,
    },
    {
      name: "should fail if there is no state and it is not a setup update",
      updateType: UpdateType.resolve,
      error: InboundChannelUpdateError.reasons.ApplyUpdateFailed,
    },
  ];

  for (const test of tests) {
    const {
      name,
      updateType,
      stateOverrides,
      updateOverrides,
      activeTransfersOverrides,
      finalBalanceOverrides,
      error,
      expected,
    } = test;

    it(name, async () => {
      // Generate the update
      const update = createTestChannelUpdateWithSigners(signers, updateType, updateOverrides);

      // Generate the previous state
      const previousState =
        updateType === UpdateType.setup
          ? undefined
          : createTestChannelStateWithSigners(signers, stateOverrides?.latestUpdate?.type ?? UpdateType.setup, {
              channelAddress,
              networkContext,
              ...stateOverrides,
            });

      // Generate the active transfer ids
      const activeTransfers = (activeTransfersOverrides ?? []).map(overrides =>
        createTestFullHashlockTransferState(overrides),
      );

      // Generate the final transfer balance
      const finalTransferBalance =
        updateType === UpdateType.resolve && finalBalanceOverrides
          ? {
              ...sampleResolvedTransfer.transferState.balance,
              ...finalBalanceOverrides,
            }
          : undefined;

      // Run the function
      const applyResult = await vectorUpdate.applyUpdate(update, previousState, activeTransfers, finalTransferBalance);

      // Validate result
      if (error) {
        expect(applyResult.isError).to.be.true;
        expect(applyResult.getError()?.message).to.be.eq(error);
      } else if (expected) {
        expect(applyResult.getError()).to.be.undefined;
        const { updatedChannel, updatedTransfer, updatedActiveTransfers } = applyResult.getValue();
        expect(updatedChannel).to.containSubset(expected.channel);

        // Validate the updated active transfer
        if (updateType !== UpdateType.create && updateType !== UpdateType.resolve) {
          // the transfer should be undefined, and the active transfers
          // should not change
          expect(updatedTransfer).to.be.undefined;
          expect(updatedActiveTransfers).to.be.undefined;
        } else {
          // On resolve:
          // - transfer balance === final balance
          // - meta === transfer meta + update meta
          // - transferResolver === update resolver
          // - removed from activeTransfers

          // On create:
          // - transfer generated from update details
          // - transfer added to activeTransfers
          const { initialStateHash, ...sanitizedTransfer } = expected.transfer!;
          expect(updatedTransfer).to.containSubset({
            ...sanitizedTransfer,
            chainId: previousState?.networkContext.chainId,
            assetId: update.assetId,
            channelFactoryAddress: previousState?.networkContext.channelFactoryAddress,
            initiator:
              updateType === UpdateType.create
                ? getSignerAddressFromPublicIdentifier(update.fromIdentifier)
                : activeTransfers[0].initiator,
            responder:
              updateType === UpdateType.create
                ? getSignerAddressFromPublicIdentifier(update.toIdentifier)
                : activeTransfers[0].responder,
            transferResolver: updateType === UpdateType.resolve ? update.details.transferResolver : undefined,
          });
          expect(updatedActiveTransfers!.map(t => t.transferId).includes(update.details.transferId)).to.be.eq(
            updateType === UpdateType.create,
          );
        }
      } else {
        expect(false).to.be.eq("Neither error or expected result provided in test");
      }
    });
  }
});

// NOTE: The `generateAndApplyUpdate` function returns the generated update,
// as well as the `updatedChannel`, `updatedTransfer`, and
// `updatedActiveTransfers`. Every return value except for the update
// is parroted from the `applyUpdate` function (unit tested above).
// Therefore, only the `update` itself must be generated. The presence
// of the other fields should be asserted, and validity tested in the
// applyUpdate functino above
describe("generateAndApplyUpdate", () => {
  // Get test constants
  const { log } = getTestLoggers("generateAndApplyUpdate", env.logLevel);
  const chainId = parseInt(Object.keys(env.chainProviders)[0]);
  const providerUrl = env.chainProviders[chainId];
  const signers = Array(2)
    .fill(0)
    .map(() => getRandomChannelSigner(providerUrl));
  const [aliceSigner, bobSigner] = signers;

  // Setup mocks
  let chainService: Sinon.SinonStubbedInstance<VectorChainReader>;
  let reconcileDeposit: Sinon.SinonStubbedInstance<any>;

  beforeEach(async () => {
    chainService = Sinon.createStubInstance(VectorChainReader);
    reconcileDeposit = Sinon.stub(vectorUtils, "reconcileDeposit");
  });

  afterEach(() => {
    Sinon.restore();
    Sinon.reset();
  });

  const makeAndVerifyCall = async (
    signer: IChannelSigner,
    params: UpdateParams<"create" | "deposit" | "resolve" | "setup">,
    previousState: FullChannelState<any> | undefined,
    activeTransfers: FullTransferState[] | undefined,
    expected: any,
    isError = false,
  ) => {
    // Make call
    const result = await vectorUpdate.generateAndApplyUpdate(
      signer,
      chainService,
      params,
      previousState,
      activeTransfers,
      log,
    );

    // Verify results
    expect(result.isError).to.be.eq(isError);
    if (isError) {
      expect(result.getError()!.message).to.be.eq(expected);
      return;
    }
    const { update, updatedChannel, updatedActiveTransfers, updatedTransfer } = result.getValue();
    console.log("expected", stringify(expected));
    console.log("update", stringify(update));
    expect(update).to.containSubset(expected);
    expect(update[signer.address === aliceSigner.address ? "aliceSignature" : "bobSignature"]).to.be.ok;
    expect(updatedChannel).to.be.ok;
    if (params.type === UpdateType.create || params.type === UpdateType.resolve) {
      expect(updatedActiveTransfers).to.be.ok;
      expect(updatedTransfer).to.be.ok;
      return;
    }
    expect(updatedActiveTransfers).to.be.undefined;
    expect(updatedTransfer).to.be.undefined;
  };

  const generateBaseExpectedUpdate = (
    signer: IChannelSigner,
    params: UpdateParams<any>,
    previousState: FullChannelState | undefined,
  ) => {
    return {
      channelAddress: previousState?.channelAddress ?? params.channelAddress,
      type: params.type,
      fromIdentifier: signer.publicIdentifier,
      toIdentifier:
        signer.publicIdentifier === aliceSigner.publicIdentifier
          ? bobSigner.publicIdentifier
          : aliceSigner.publicIdentifier,
      nonce: (previousState?.nonce ?? 0) + 1,
    };
  };

  it("should work for setup", async () => {
    // Set test params
    const params = createTestUpdateParams(UpdateType.setup, {
      details: {
        counterpartyIdentifier: bobSigner.publicIdentifier,
      },
    });
    const previousState = undefined;
    const activeTransfers = undefined;
    const signer = aliceSigner;

    // Create expected return values
    const expectedUpdate = {
      ...generateBaseExpectedUpdate(signer, params, previousState),
      details: {
        timeout: params.details.timeout,
        networkContext: params.details.networkContext,
      },
      balance: { to: signers.map(s => s.address), amount: ["0", "0"] },
      assetId: mkAddress(),
    };

    // Make call
    await makeAndVerifyCall(signer, params, previousState, activeTransfers, expectedUpdate);
  });

  it("should work for bob deposit", async () => {
    const channelAddress = mkAddress("0xc");
    const depositAmt = BigNumber.from(15);
    const assetId = mkAddress("0xa");

    // Set test params
    const params = createTestUpdateParams(UpdateType.deposit, {
      channelAddress,
      details: { channelAddress, assetId },
    });
    const previousState = createTestChannelStateWithSigners(signers, UpdateType.setup, {
      channelAddress,
      assetIds: [],
      balances: [],
      processedDepositsA: [],
      processedDepositsB: [],
    });
    const activeTransfers = undefined;
    const signer = bobSigner;

    // Set mocks
    const balance = { to: signers.map(s => s.address), amount: ["0", depositAmt.toString()] };
    const totalDepositsBob = depositAmt.toString();
    const totalDepositsAlice = "0";
    reconcileDeposit.resolves(
      Result.ok({
        totalDepositsBob,
        totalDepositsAlice,
        balance,
      }),
    );

    // Set expected value
    const expectedUpdate = {
      ...generateBaseExpectedUpdate(signer, params, previousState),
      balance,
      assetId,
      details: {
        totalDepositsAlice,
        totalDepositsBob,
      },
    };

    // Make call
    await makeAndVerifyCall(signer, params, previousState, activeTransfers, expectedUpdate);
  });

  it.skip("should work for alice deposit", async () => {});
  it.skip("should work for alice create", async () => {});

  it("should work for bob create", async () => {
    const channelAddress = mkAddress("0xc");
    const transferBalance = { to: [bobSigner.address, aliceSigner.address], amount: ["7", "0"] };
    const transferAsset = mkAddress();
    const transferState = createTestHashlockTransferState();

    // Set test params
    const params = createTestUpdateParams(UpdateType.create, {
      channelAddress,
      details: {
        channelAddress,
        balance: transferBalance,
        assetId: transferAsset,
        transferDefinition: mkAddress(),
        transferInitialState: transferState,
        meta: { hello: "world" },
      },
    });
    const previousState = createTestChannelStateWithSigners(signers, UpdateType.setup, {
      channelAddress,
      assetIds: [transferAsset],
      balances: [{ to: signers.map(s => s.address), amount: ["14", "23"] }],
      processedDepositsA: ["37"],
      processedDepositsB: ["0"],
    });
    const activeTransfers = [];
    const signer = bobSigner;

    // Set mocks
    const registryInfo = {
      stateEncoding: HashlockTransferStateEncoding,
      resolverEncoding: HashlockTransferResolverEncoding,
      name: "test",
      definition: params.details.transferDefinition,
    };
    chainService.getRegisteredTransferByDefinition.resolves(Result.ok(registryInfo));

    // Set expected value
    const expectedUpdate = {
      ...generateBaseExpectedUpdate(signer, params, previousState),
      balance: { to: signers.map(s => s.address), amount: ["14", "16"] },
      assetId: params.details.assetId,
      details: {
        transferId: getTransferId(
          channelAddress,
          previousState.nonce.toString(),
          params.details.transferDefinition,
          params.details.timeout,
        ),
        balance: transferBalance,
        transferDefinition: params.details.transferDefinition,
        transferTimeout: params.details.timeout,
        transferInitialState: params.details.transferInitialState,
        transferEncodings: [registryInfo.stateEncoding, registryInfo.resolverEncoding],
        meta: params.details.meta,
      },
    };

    // Make call
    await makeAndVerifyCall(signer, params, previousState, activeTransfers, expectedUpdate);
  });

  it("should work for alice resolve", async () => {
    const channelAddress = mkAddress("0xc");
    const transferBalance = { to: [bobSigner.address, aliceSigner.address], amount: ["0", "7"] };
    const transferAsset = mkAddress();
    const transfer = createTestFullHashlockTransferState({
      balance: { ...transferBalance, amount: ["7", "0"] },
      assetId: transferAsset,
      channelAddress,
      initiator: bobSigner.address,
      responder: aliceSigner.address,
      meta: { existing: "meta" },
    });
    const resolver = transfer.transferResolver;
    transfer.transferResolver = undefined;

    // Set test params
    const params = createTestUpdateParams(UpdateType.resolve, {
      channelAddress,
      details: {
        transferId: transfer.transferId,
        transferResolver: resolver,
        meta: { hello: "world" },
      },
    });
    const previousState = createTestChannelStateWithSigners(signers, UpdateType.create, {
      channelAddress,
      assetIds: [transferAsset],
      balances: [{ to: signers.map(s => s.address), amount: ["14", "16"] }],
      processedDepositsA: ["37"],
      processedDepositsB: ["0"],
    });
    const activeTransfers = [transfer];
    const signer = aliceSigner;

    // Set mocks
    const registryInfo = {
      stateEncoding: transfer.transferEncodings[0],
      resolverEncoding: transfer.transferEncodings[1],
      name: "test",
      definition: transfer.transferDefinition,
    };
    chainService.getRegisteredTransferByDefinition.resolves(Result.ok(registryInfo));
    chainService.resolve.resolves(Result.ok(transferBalance));

    // Set expected value
    const expectedUpdate = {
      ...generateBaseExpectedUpdate(signer, params, previousState),
      balance: { to: signers.map(s => s.address), amount: ["21", "16"] },
      assetId: transfer.assetId,
      details: {
        transferId: transfer.transferId,
        transferDefinition: transfer.transferDefinition,
        transferResolver: resolver,
        merkleRoot: mkHash(),
        meta: params.details.meta,
      },
    };

    // Make call
    await makeAndVerifyCall(signer, params, previousState, activeTransfers, expectedUpdate);
  });

  it.skip("should work for bob resolve", async () => {});
  it.skip("should fail if reconcileDeposit fails", async () => {});
  it.skip("should fail if trying to resolve inactive transfer", async () => {});
  it.skip("should fail if calling resolve on chainService fails", async () => {});
  it.skip("should fail if it cannot get the registered transfer", async () => {});
  it.skip("should work if creating a transfer to someone outside of channel", async () => {});
  it.skip("should work if resolving a transfer to someone outside of channel", async () => {});
});
