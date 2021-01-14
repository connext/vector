/* eslint-disable @typescript-eslint/no-empty-function */
import { VectorChainService } from "@connext/vector-contracts";
import { IVectorProtocol, IChannelSigner, IVectorStore, Result } from "@connext/vector-types";
import { VectorEngine } from "@connext/vector-engine";
import {
  expect,
  getTestLoggers,
  getRandomBytes32,
  mkAddress,
  mkPublicIdentifier,
  createTestChannelState,
  getRandomAddress,
  mkBytes32,
} from "@connext/vector-utils";
import { AddressZero } from "@ethersproject/constants";
import { JsonRpcProvider } from "@ethersproject/providers";
import { BigNumber } from "@ethersproject/bignumber";
import Sinon from "sinon";
global.window = {} as any;
import "mock-local-storage";
(window as any).localStorage = global.localStorage;

import { DirectProvider, IframeChannelProvider } from "../channelProvider";
import { BrowserNode } from "../index";

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

  beforeEach(async () => {
    directProvider = Sinon.createStubInstance(DirectProvider);
  });

  afterEach(async () => {
    Sinon.restore();
  });

  // Test should validate:
  // - store calls when channel is updated
  // - event emission is done properly
  // - update on latest channel corresponds to input params
  it.only("should be able to make crossChain transfer for ETH", async () => {
    // channel states
    const senderChannelState = createTestChannelState("setup", {
      alice: routerSigner,
      aliceIdentifier: routerPublicIdentifier,
      bob: senderSigner,
      bobIdentifier: senderPublicIdentifier,
      channelAddress: senderSigner,
      networkContext: {
        chainId: depositChainId,
      },
    });

    const receiverChannelState = createTestChannelState("setup", {
      alice: routerSigner,
      aliceIdentifier: routerPublicIdentifier,
      bob: senderSigner,
      bobIdentifier: senderPublicIdentifier,
      channelAddress: senderSigner,
      networkContext: {
        chainId: withdrawChainId,
      },
    });

    // create browser instance
    const browserNode = new BrowserNode({
      logger: log,
      routerPublicIdentifier: senderPublicIdentifier,
      supportedChains: [1337, 1338],
      chainProviders: { [depositChainId]: "http://localhost:8545", [withdrawChainId]: "http://localhost:8546" },
    });

    const senderTransferId = mkBytes32("0xabc");
    const crossChainTransferId = getRandomBytes32();

    // mock out all calls to `send` in the crossChainTransfer function
    // get sender channel
    directProvider.send.onFirstCall().resolves(senderChannelState.channel);

    // get receiver channal
    directProvider.send.onSecondCall().resolves(receiverChannelState.channel);

    // reconcile deposit
    directProvider.send.onThirdCall().resolves({ channelAddress: senderChannelState.channel.channelAddress });

    // get sender channel
    directProvider.send.onCall(4).resolves(senderChannelState.channel);

    // conditional transfer
    directProvider.send.onCall(5).resolves({
      channelAddress: senderChannelState.channel.channelAddress,
      latestUpdate: { details: { transferId: senderTransferId, meta: { routingId: crossChainTransferId } } },
    });

    // get transfer by routing id, return undefined so that it waits for the event
    directProvider.send.onCall(6).resolves(undefined);

    // resolve on with ConditionalTransferCreatedPayload
    directProvider.on.yields({
      transfer: {
        meta: { routingId: crossChainTransferId },
        channelAddress: receiverChannelState.channel.channelAddress,
      },
    });

    // set channel provider into instance
    browserNode.channelProvider = directProvider as any;

    const withdrawalAddress = getRandomAddress();

    const params = {
      amount: transferAmount,
      fromChainId: depositChainId,
      fromAssetId: depositAssetId,
      toChainId: withdrawChainId,
      toAssetId: withdrawAssetId,
      reconcileDeposit: true,
      withdrawalAddress: withdrawalAddress,
      crossChainTransferId,
    };

    // assert each call to saveCrossChainTransfer happens properly

    const result = await browserNode!.crossChainTransfer(params);
    console.log("result: ", result);
    expect(result).to.be.ok;
  });

  it("should be able to make crossChain transfer for ERC20 Token", async () => {
    //connect
    // deposit
    // crossChainTransfer
  });
});
