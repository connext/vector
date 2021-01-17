import {
  ChannelRpcMethods,
  ChannelRpcMethod,
  ChannelRpcMethodsPayloadMap,
  TransferNames,
  EngineEvents,
} from "@connext/vector-types";
import {
  expect,
  getTestLoggers,
  getRandomBytes32,
  mkAddress,
  mkPublicIdentifier,
  createTestChannelState,
  getRandomAddress,
  createTestFullHashlockTransferState,
  mkHash,
} from "@connext/vector-utils";
import Sinon from "sinon";
global.window = {} as any;
import "mock-local-storage";
(window as any).localStorage = global.localStorage;

import { DirectProvider } from "../channelProvider";
import { BrowserNode } from "../index";
import * as crossChainStore from "../services/crossChainTransferStore";

import { env } from "./env";

const testName = "VectorEngine index utils";
const { log } = getTestLoggers(testName, env.logLevel);

const senderPublicIdentifier = mkPublicIdentifier("vectorA");
const senderSigner = mkAddress("0xA");
const routerPublicIdentifier = mkPublicIdentifier("vectorE");
const routerSigner = mkAddress("0xE");

const depositChainId = 1337;
const withdrawChainId = 1338;
const depositAssetId = mkAddress("0x1337");
const withdrawAssetId = mkAddress("0x1338");
const transferAmount = "1";

describe("BrowserNode", () => {
  let directProvider: Sinon.SinonStubbedInstance<DirectProvider>;
  let saveCrossChainTransferStub: Sinon.SinonStub;
  let getCrossChainTransferStub: Sinon.SinonStub;

  beforeEach(async () => {
    // provider stub
    directProvider = Sinon.createStubInstance(DirectProvider);

    // local storage stubs
    saveCrossChainTransferStub = Sinon.stub(crossChainStore, "saveCrossChainTransfer");
    getCrossChainTransferStub = Sinon.stub(crossChainStore, "getCrossChainTransfer");
  });

  afterEach(async () => {
    Sinon.restore();
  });

  // Test should validate:
  // - store calls when channel is updated
  // - event emission is done properly
  // - update on latest channel corresponds to input params
  const stubWithArgsVerification = <T extends ChannelRpcMethod>(
    callCount: number,
    method: T,
    params: Partial<ChannelRpcMethodsPayloadMap[T]>,
    resolves: any,
  ) => {
    directProvider.send.onCall(callCount).callsFake((args) => {
      expect(args.method).to.be.eq(method);
      expect(args.params).to.containSubset(params);
      return Promise.resolve(resolves);
    });
  };

  it.only("should be able to make crossChain transfer for ETH", async () => {
    // channel states
    const { channel: depositChannelState } = createTestChannelState("setup", {
      alice: routerSigner,
      aliceIdentifier: routerPublicIdentifier,
      bob: senderSigner,
      bobIdentifier: senderPublicIdentifier,
      channelAddress: mkAddress("0xccc1337"),
      networkContext: {
        chainId: depositChainId,
      },
    });
    const depositTransferId = getRandomBytes32();

    const { channel: withdrawChannelState } = createTestChannelState("setup", {
      alice: routerSigner,
      aliceIdentifier: routerPublicIdentifier,
      bob: senderSigner,
      bobIdentifier: senderPublicIdentifier,
      channelAddress: mkAddress("0xccc1338"),
      networkContext: {
        chainId: withdrawChainId,
      },
    });
    const withdrawTransferId = getRandomBytes32();

    // create browser instance
    const browserNode = new BrowserNode({
      logger: log,
      routerPublicIdentifier,
      supportedChains: [1337, 1338],
      chainProviders: { [depositChainId]: "http://localhost:8545", [withdrawChainId]: "http://localhost:8546" },
    });
    // TODO: set these by connecting or initing!]
    browserNode.channelProvider = directProvider as any;
    browserNode.publicIdentifier = senderPublicIdentifier;

    // Create test params
    const crossChainTransferId = getRandomBytes32();
    const withdrawalAddress = getRandomAddress();
    const params = {
      amount: transferAmount,
      fromChainId: depositChainId,
      fromAssetId: depositAssetId,
      toChainId: withdrawChainId,
      toAssetId: withdrawAssetId,
      reconcileDeposit: true,
      withdrawalAddress,
      crossChainTransferId,
    };

    // mock out all calls to `send` in the crossChainTransfer function
    // get sender channel
    stubWithArgsVerification(
      0,
      ChannelRpcMethods.chan_getChannelStateByParticipants,
      {
        chainId: depositChainId,
        alice: routerPublicIdentifier,
      },
      depositChannelState,
    );

    // get receiver channel
    stubWithArgsVerification(
      1,
      ChannelRpcMethods.chan_getChannelStateByParticipants,
      {
        chainId: withdrawChainId,
        alice: routerPublicIdentifier,
      },
      withdrawChannelState,
    );

    // get router config
    stubWithArgsVerification(
      2,
      ChannelRpcMethods.chan_getRouterConfig,
      { routerIdentifier: routerPublicIdentifier },
      {
        supportedChains: [depositChainId, withdrawChainId],
        allowedSwaps: [
          {
            fromChainId: depositChainId,
            toChainId: withdrawChainId,
            fromAssetId: depositAssetId,
            toAssetId: withdrawAssetId,
            priceType: "hardcoded",
            hardcodedRate: "1",
          },
        ],
      },
    );

    // reconcile deposit
    stubWithArgsVerification(
      3,
      ChannelRpcMethods.chan_deposit,
      {
        assetId: depositAssetId,
        channelAddress: depositChannelState.channelAddress,
      },
      { channelAddress: depositChannelState.channelAddress },
    );

    // get sender channel post deposit
    stubWithArgsVerification(
      4,
      ChannelRpcMethods.chan_getChannelState,
      {
        channelAddress: depositChannelState.channelAddress,
      },
      depositChannelState,
    );

    // sender creates conditional transfer
    stubWithArgsVerification(
      5,
      ChannelRpcMethods.chan_createTransfer,
      {
        amount: transferAmount,
        assetId: depositAssetId,
        channelAddress: depositChannelState.channelAddress,
        type: TransferNames.HashlockTransfer,
        recipient: senderPublicIdentifier,
        recipientAssetId: withdrawAssetId,
        recipientChainId: withdrawChainId,
        meta: {
          routingId: crossChainTransferId,
          crossChainTransferId,
          requireOnline: true,
        },
      },
      {
        ...depositChannelState,
        latestUpdate: {
          details: {
            transferId: depositTransferId,
            meta: { routingId: crossChainTransferId },
          },
        },
      },
    );

    // get receiver transfer by routingId if exists (doesnt)
    stubWithArgsVerification(
      6,
      ChannelRpcMethods.chan_getTransferStateByRoutingId,
      {
        channelAddress: withdrawChannelState.channelAddress,
        routingId: crossChainTransferId,
      },
      undefined,
    );

    // sender transfer should not be cancelled (left in store)
    // NOTE: this just needs to return any object
    getCrossChainTransferStub.returns({ crossChainTransferId });

    // resolve on with ConditionalTransferCreatedPayload
    const withdrawTransfer = createTestFullHashlockTransferState({
      channelAddress: withdrawChannelState.channelAddress,
      chainId: withdrawChainId,
      initiator: routerSigner,
      initiatorIdentifier: routerPublicIdentifier,
      responder: senderPublicIdentifier,
      responderIdentifier: senderSigner,
      assetId: withdrawAssetId,
      transferId: withdrawTransferId,
      meta: { routingId: crossChainTransferId },
      balance: { to: [routerSigner, senderSigner], amount: [transferAmount, "0"] },
    });
    directProvider.on.callsFake((event, callback) => {
      expect(event).to.be.eq(EngineEvents.CONDITIONAL_TRANSFER_CREATED);
      const payload = {
        aliceIdentifier: routerPublicIdentifier,
        bobIdentifier: senderPublicIdentifier,
        channelAddress: withdrawChannelState.channelAddress,
        channelBalance: { to: [routerSigner, senderSigner], amount: ["10", "231"] },
        transfer: withdrawTransfer,
        conditionType: TransferNames.HashlockTransfer,
      };
      return callback(payload);
    });

    // resolve receiver transfer
    stubWithArgsVerification(
      7,
      ChannelRpcMethods.chan_resolveTransfer,
      {
        transferId: withdrawTransferId,
        channelAddress: withdrawChannelState.channelAddress,
      },
      {
        ...withdrawChannelState,
        latestUpdate: {
          details: {
            transferId: withdrawTransferId,
            meta: { routingId: crossChainTransferId },
          },
        },
      },
    );

    // withdraw from receiver channel
    const withdrawTx = mkHash("0x1338eeeaaa");
    stubWithArgsVerification(
      8,
      ChannelRpcMethods.chan_withdraw,
      {
        channelAddress: withdrawChannelState.channelAddress,
        assetId: withdrawAssetId,
        amount: transferAmount,
        recipient: params.withdrawalAddress,
      },
      {
        channel: {
          ...withdrawChannelState,
          latestUpdate: {
            details: {
              transferId: withdrawTransferId,
              meta: { routingId: crossChainTransferId },
            },
          },
        },
        transactionHash: withdrawTx,
      },
    );

    // assert each call to saveCrossChainTransfer happens properly

    const result = await browserNode.crossChainTransfer(params);
    console.log("result: ", result);
    expect(result).to.containSubset({ withdrawalTx: withdrawTx, withdrawalAmount: transferAmount });

    ///////// Verify all local storage calls
    // save after verifying params
    const saveTransferCalls = saveCrossChainTransferStub.getCalls();
    const { crossChainTransferId: id, ...res } = params;
    // first call -- save initial transfer state
    expect(saveTransferCalls[0].args).to.containSubset([
      crossChainTransferId,
      crossChainStore.CrossChainTransferStatus.INITIAL,
      { ...res, error: false },
    ]);

    // second call -- save deposit transfer state
    expect(saveTransferCalls[1].args).to.containSubset([
      crossChainTransferId,
      crossChainStore.CrossChainTransferStatus.DEPOSITED,
      { ...res, error: false },
    ]);

    // third call -- save sender create transfer state
    expect(saveTransferCalls[2].args).to.containSubset([
      crossChainTransferId,
      crossChainStore.CrossChainTransferStatus.TRANSFER_1,
      { ...res, error: false },
    ]);
    expect(saveTransferCalls[2].args[2].preImage).to.be.ok;

    // fourth call -- save receiver create transfer state
    expect(saveTransferCalls[3].args).to.containSubset([
      crossChainTransferId,
      crossChainStore.CrossChainTransferStatus.TRANSFER_2,
      { ...res, withdrawalAmount: transferAmount, error: false },
    ]);
    expect(saveTransferCalls[3].args[2].preImage).to.be.ok;
  });

  it("should be able to make crossChain transfer for ERC20 Token", async () => {
    //connect
    // deposit
    // crossChainTransfer
  });
});
