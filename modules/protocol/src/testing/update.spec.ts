import { VectorChainReader } from "@connext/vector-contracts";
import {
  UpdateType,
  InboundChannelUpdateError,
  FullChannelState,
  FullTransferState,
  Values,
  NetworkContext,
  Result,
  ChannelUpdate,
  DEFAULT_TRANSFER_TIMEOUT,
  Balance,
  TransferNames,
  HashlockTransferStateEncoding,
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
  createTestFullHashlockTransferState,
  ChannelSigner,
  hashTransferState,
  expect,
  MemoryStoreService,
  getSignerAddressFromPublicIdentifier,
} from "@connext/vector-utils";
import { BigNumber } from "ethers";
import Sinon from "sinon";

import * as vectorUpdate from "../update";

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
    channelMastercopyAddress: mkAddress("0xcccffff333"),
    transferRegistryAddress: mkAddress("0xddddeeeeefffff44444"),
  };

  // Sample transfer (alice creating, bob recieving)
  const transferAmount = "7";
  const sampleResolvedTransfer = createTestFullHashlockTransferState({
    initiator: participants[0],
    responder: participants[1],
    initialBalance: { to: participants, amount: [transferAmount.toString(), "0"] },
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
        details: { totalDepositedA: "5", totalDepositedB: "12" },
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
        details: { totalDepositedA: "12", totalDepositedB: "7" },
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
      finalBalanceOverrides: sampleResolvedTransfer.transferState.balance,
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
      finalBalanceOverrides: sampleResolvedTransfer.transferState.balance,
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
        const applyRet = applyResult.getValue();
        expect(applyRet.channel).to.containSubset(expected.channel);

        // Validate the updated active transfer
        if (updateType !== UpdateType.create && updateType !== UpdateType.resolve) {
          // the transfer should be undefined, and the active transfers
          // should not change
          expect(applyRet.transfer).to.be.undefined;
          expect(applyRet.activeTransfers).to.deep.eq(activeTransfers);
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
          expect(applyRet.transfer).to.containSubset({
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
          expect(applyRet.activeTransfers.map(t => t.transferId).includes(update.details.transferId)).to.be.eq(
            updateType === UpdateType.create,
          );
        }
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
  expectedTransfer?: Partial<FullTransferState>;
  error?: Values<typeof InboundChannelUpdateError.reasons>;
  from?: ChannelSigner;

  // Mock values
  storedChannel?: PartialFullChannelState<any>;
  onchainBalance?: BigNumber;
  depositA?: BigNumber;
  depositB?: BigNumber;
  resolveBalance?: Balance;
};

describe("generateUpdate", () => {
  // FIXME: THESE ARE BLOCKING TESTS!
  it.skip("should fail if it fails parameter validation", () => {});
  it.skip("should fail if it is unable to reconcile the deposit", () => {});
  it.skip("should fail if trying to resolve an inactive transfer", () => {});
  it.skip("should fail if fails to call resolve using chain service", () => {});
  it.skip("should work if creating a transfer to someone outside of channel", () => {});
  it.skip("should work if resolving a transfer to someone outside of channel", () => {});

  // Get channel constants
  const chainId = parseInt(Object.keys(env.chainProviders)[0]);
  const providerUrl = env.chainProviders[chainId];
  const signers = Array(2)
    .fill(0)
    .map(() => getRandomChannelSigner(providerUrl));
  const participants = signers.map(s => s.address);
  const publicIdentifiers = signers.map(s => s.publicIdentifier);
  const channelAddress = mkAddress("0xccc");
  const networkContext: NetworkContext = {
    chainId,
    providerUrl,
    channelFactoryAddress: mkAddress("0xaaabbbcccc"),
    channelMastercopyAddress: mkAddress("0xbbbbccc3334"),
    transferRegistryAddress: mkAddress("0xddddeeeeefffff44444"),
  };

  // Get transfer constants
  const emptyHashlockTransfer = createTestFullHashlockTransferState({
    channelAddress,
    balance: { to: participants, amount: ["0", "0"] },
    transferTimeout: DEFAULT_TRANSFER_TIMEOUT.toString(),
  });
  const merkleProofData = [mkHash("0x1235asdf")];
  const merkleRoot = mkHash("0xaaaeeecccbbbb123");

  // Declare mocks
  let store: Sinon.SinonStubbedInstance<MemoryStoreService>;
  let chainService: Sinon.SinonStubbedInstance<VectorChainReader>;

  beforeEach(async () => {
    store = Sinon.createStubInstance(MemoryStoreService);
    chainService = Sinon.createStubInstance(VectorChainReader);

    const transferInfo = {
      name: TransferNames.HashlockTransfer,
      stateEncoding: emptyHashlockTransfer.transferEncodings[0],
      resolverEncoding: emptyHashlockTransfer.transferEncodings[1],
      definition: emptyHashlockTransfer.transferDefinition,
    };
    chainService.getRegisteredTransferByDefinition.resolves(Result.ok(transferInfo));

    // Mock `applyUpdate` (tested above) so it always returns
    // an empty object
    Sinon.stub(vectorUpdate, "applyUpdate").resolves(Result.ok({} as any));
    // Mock merkle tree
    // FIXME: y no work here :(
    // const merkleStub = Sinon.createStubInstance(MerkleTree);
    // merkleStub.getHexProof.returns(merkleProofData);
    // merkleStub.getHexRoot.returns(merkleRoot);
  });

  afterEach(() => {
    Sinon.restore();
    Sinon.reset();
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
        processedDepositsA: [],
        processedDepositsB: [],
        merkleRoot: mkHash(),
        nonce: 0,
        timeout: "0",
        latestUpdate: {} as any, // There is no latest update on setup
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
        processedDepositsA: [],
        processedDepositsB: [],
        merkleRoot: mkHash(),
        nonce: 1,
      },
      expectedUpdate: {
        nonce: 2,
        assetId: mkAddress(),
        balance: { to: participants, amount: ["0", "10"] },
        details: { totalDepositedA: "0", totalDepositedB: "10" },
      },
      onchainBalance: BigNumber.from(10),
      depositB: BigNumber.from(10),
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
        processedDepositsA: [],
        processedDepositsB: [],
        merkleRoot: mkHash(),
        nonce: 1,
      },
      expectedUpdate: {
        nonce: 2,
        assetId: mkAddress(),
        balance: { to: participants, amount: ["10", "0"] },
        details: { totalDepositedA: "10", totalDepositedB: "0" },
      },
      onchainBalance: BigNumber.from(10),
      depositA: BigNumber.from(10),
    },
    {
      name: "should work for create (alice creates)",
      updateType: UpdateType.create,
      paramOverrides: {
        details: {
          amount: "7",
          transferInitialState: {
            ...emptyHashlockTransfer.transferState,
            balance: { to: participants, amount: ["7", "0"] },
          },
          encodings: emptyHashlockTransfer.transferEncodings,
          timeout: emptyHashlockTransfer.transferTimeout,
          meta: emptyHashlockTransfer.meta,
        },
      },
      stateOverrides: {
        assetIds: [mkAddress()],
        processedDepositsA: [],
        processedDepositsB: [],
        balances: [{ to: participants, amount: ["14", "8"] }],
        nonce: 3,
      },
      expectedUpdate: {
        nonce: 4,
        balance: { to: participants, amount: ["7", "8"] },
        assetId: mkAddress(),
        details: {
          transferInitialState: {
            ...emptyHashlockTransfer.transferState,
            balance: { to: participants, amount: ["7", "0"] },
          },
          transferEncodings: emptyHashlockTransfer.transferEncodings,
          transferTimeout: emptyHashlockTransfer.transferTimeout,
          merkleProofData,
          merkleRoot,
          meta: emptyHashlockTransfer.meta,
        },
      },
      expectedTransfer: {
        ...emptyHashlockTransfer,
        chainId: networkContext.chainId,
        initialBalance: { to: participants, amount: ["7", "0"] },
        channelFactoryAddress: networkContext.channelFactoryAddress,
        transferState: {
          ...emptyHashlockTransfer.transferState,
          balance: { to: participants, amount: ["7", "0"] },
        },
        initiator: participants[0],
        responder: participants[1],
        initialStateHash: hashTransferState(
          {
            ...emptyHashlockTransfer.transferState,
            balance: { to: participants, amount: ["7", "0"] },
          },
          HashlockTransferStateEncoding,
        ),
        transferResolver: undefined,
      },
    },
    {
      name: "should work for resolve (bob resolves)",
      updateType: UpdateType.resolve,
      paramOverrides: {
        details: {
          transferId: emptyHashlockTransfer.transferId,
          transferResolver: emptyHashlockTransfer.transferResolver,
          meta: { resolve: "test" },
        },
      },
      stateOverrides: {
        assetIds: [mkAddress()],
        processedDepositsA: [],
        processedDepositsB: [],
        balances: [{ to: participants, amount: ["7", "8"] }],
        nonce: 3,
      },
      expectedUpdate: {
        nonce: 4,
        balance: { to: participants, amount: ["7", "15"] },
        assetId: mkAddress(),
        details: {
          transferId: emptyHashlockTransfer.transferId,
          transferResolver: emptyHashlockTransfer.transferResolver,
          merkleRoot: mkHash(),
          meta: { resolve: "test" },
        },
      },
      expectedTransfer: {
        meta: { resolve: "test" },
        transferId: emptyHashlockTransfer.transferId,
        initiator: participants[0],
        responder: participants[1],
        transferState: {
          ...emptyHashlockTransfer.transferState,
          balance: { to: participants, amount: ["0", "7"] },
        },
        initialStateHash: hashTransferState(
          {
            ...emptyHashlockTransfer.transferState,
            balance: { to: participants, amount: ["7", "0"] },
          },
          HashlockTransferStateEncoding,
        ),
        transferResolver: emptyHashlockTransfer.transferResolver,
      },
      resolveBalance: { to: participants, amount: ["0", "7"] },
    },
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
      depositB,
      resolveBalance,
      from,
    } = test;

    it(name, async () => {
      // // Generate the expected transfer
      // const expectedTransfer = createTestFullHashlockTransferState(expectedTransfer)

      // Generate the transfer from the params IFF the update type is resolve
      let transfer: FullTransferState | undefined = undefined;
      if (updateType === UpdateType.resolve) {
        transfer = createTestFullHashlockTransferState({
          ...expectedTransfer,
          initialBalance: { ...resolveBalance!, amount: [resolveBalance!.amount[1], resolveBalance!.amount[0]] },
        });
        transfer.transferResolver = undefined;
      }

      // Generate the params
      const params = createTestUpdateParams(updateType, { channelAddress, ...paramOverrides });

      // Generate the state
      const state = createTestChannelStateWithSigners(signers, UpdateType.setup, {
        channelAddress,
        networkContext,
        ...stateOverrides,
      });

      // Set the mocks
      const inStore = !!storedChannel
        ? createTestChannelStateWithSigners(signers, UpdateType.setup, {
            channelAddress,
            networkContext,
            ...storedChannel,
          })
        : state;
      store.getChannelState.resolves(inStore);

      // Chain service mocks are only used by deposit/resolve
      chainService.getTotalDepositedA.resolves(Result.ok(depositA ?? BigNumber.from(0)));
      chainService.getTotalDepositedB.resolves(Result.ok(depositB ?? BigNumber.from(0)));

      chainService.getChannelOnchainBalance.resolves(Result.ok(onchainBalance ?? BigNumber.from(0)));

      chainService.resolve.resolves(Result.ok(resolveBalance ?? { to: participants, amount: ["0", "0"] }));

      // Execute function call
      const result = await vectorUpdate.generateUpdate(
        params,
        state,
        [transfer].filter(x => !!x) as any,
        chainService,
        from ?? signers[0],
      );

      // Verify result
      if (error) {
        expect(result.getError()?.message).to.be.eq(error);
      } else if (expectedUpdate) {
        expect(result.getError()).to.be.undefined;
        const { update, transfer: updatedTransfer } = result.getValue()!;

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
        const { aliceSignature, bobSignature, details, ...unsigned } = expected;

        // Dont compare transferIds or merkle data
        const { transferId, merkleProofData, merkleRoot, ...sanitizedDetails } = details;

        expect(update).to.containSubset({
          ...unsigned,
          details: {
            ...sanitizedDetails,
          },
        });

        // Verify transfer
        if (transfer) {
          const { transferId: expectedId, ...sanitizedTransfer } = expectedTransfer ?? {};
          expect(updatedTransfer).to.containSubset(sanitizedTransfer);
        }

        // Verify update initiator added sigs
        expect(from?.address && from?.address == state.bob ? update.bobSignature : update.aliceSignature).to.be.ok;
        expect(from?.address && from?.address == state.bob ? update.aliceSignature : update.bobSignature).to.not.be.ok;
      } else {
        expect(false).to.be.eq("Neither error or expected result provided in test");
      }
    });
  }
});
