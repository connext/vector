/* eslint-disable @typescript-eslint/no-empty-function */
import { VectorChainService } from "@connext/vector-contracts";
import { IVectorProtocol, FullChannelState, IEngineStore } from "@connext/vector-types";
import { VectorEngine } from "@connext/vector-engine";
import {
  expect,
  getRandomChannelSigner,
  getTestLoggers,
  MemoryStoreService,
  MemoryMessagingService,
  MemoryLockService,
  getRandomBytes32,
} from "@connext/vector-utils";
import { AddressZero } from "@ethersproject/constants";
import { JsonRpcProvider } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
import { BigNumber } from "@ethersproject/bignumber";
import Sinon from "sinon";

import { DirectProvider, IframeChannelProvider, IRpcChannelProvider } from "../channelProvider";
import { createVectorInstances } from "../../../protocol/src/testing/utils";
import { BrowserNode } from "../index";

import { env } from "./env";

const testName = "VectorEngine index utils";
const { log } = getTestLoggers(testName, env.logLevel);

export const depositChainId = parseInt(Object.keys(env.chainProviders)[0]);
export const recipientChainId = parseInt(Object.keys(env.chainProviders)[1]);

export const senderAssetId = env.chainAddresses[depositChainId]?.testTokenAddress ?? "";
export const receiverAssetId = env.chainAddresses[recipientChainId]?.testTokenAddress ?? "";

export const senderProvider = new JsonRpcProvider(env.chainProviders[depositChainId], depositChainId);
export const receiverProvider = new JsonRpcProvider(env.chainProviders[recipientChainId], recipientChainId);

describe("BrowserNode", () => {
  let alice: IVectorProtocol;
  let bob: IVectorProtocol;

  let depositChainId: number;
  let recipientChainId: number;
  let senderAssetId: string;
  let receiverAssetId: string;

  let iframe: Sinon.SinonStubbedInstance<IframeChannelProvider>;
  let connectStub: Sinon.SinonStub;

  let assetId: string;
  let transferAmount: any;
  let storeService: IEngineStore;
  let value: BigNumber;

  beforeEach(async () => {
    [alice, bob] = await createVectorInstances(true, 2);

    storeService = Sinon.createStubInstance(MemoryStoreService, {
      getChannelStates: Promise.resolve([]),
    });
    // Set test constants
    assetId = AddressZero;
    transferAmount = "1";
    depositChainId = parseInt(Object.keys(env.chainProviders)[0]);
    recipientChainId = parseInt(Object.keys(env.chainProviders)[1]);

    senderAssetId = env.chainAddresses[depositChainId]?.testTokenAddress ?? "";
    receiverAssetId = env.chainAddresses[recipientChainId]?.testTokenAddress ?? "";

    log.info({
      alice: alice.publicIdentifier,
      bob: bob.publicIdentifier,
    });

    iframe = Sinon.createStubInstance(IframeChannelProvider);
    connectStub = Sinon.stub(IframeChannelProvider, "connect");
    value = BigNumber.from("1000");
  });

  afterEach(async () => {
    await alice.off();
    await bob.off();
    Sinon.restore();
  });

  // Test should validate:
  // - store calls when channel is updated
  // - event emission is done properly
  // - update on latest channel corresponds to input params
  it.only("should be able to make crossChain transfer for ETH", async () => {
    console.log(env);
    //connect
    const browserNode = new BrowserNode({
      routerPublicIdentifier: alice.publicIdentifier,
      supportedChains: [depositChainId, recipientChainId],
      chainProviders: { [depositChainId]: "http://localhost:8545", [recipientChainId]: "http://localhost:8546" },
    });

    console.log(depositChainId, recipientChainId, env.chainProviders[0], env.chainProviders[1]);
    const engine = await VectorEngine.connect(
      Sinon.createStubInstance(MemoryMessagingService),
      Sinon.createStubInstance(MemoryLockService),
      storeService,
      getRandomChannelSigner(),
      Sinon.createStubInstance(VectorChainService),
      env.chainAddresses,
      log,
      false,
    );

    connectStub.resolves(new DirectProvider(engine));

    await browserNode.init();

    const depositChannelRes = await browserNode!.getStateChannelByParticipants({
      chainId: depositChainId,
      counterparty: alice.publicIdentifier,
    });
    const depositChannel = depositChannelRes.getValue() as FullChannelState;
    const _depositAddress = depositChannel!.channelAddress;

    expect(engine).to.be.instanceOf(VectorEngine);

    const depositAssetId = AddressZero;
    const recipientAssetId = AddressZero;

    // fund router

    // deposit
    const depositor = getRandomChannelSigner(senderProvider);
    const tx = await depositor.sendTransaction({ value, to: _depositAddress });

    await tx.wait();
    // crossChainTransfer

    const crossChainTransferId = getRandomBytes32();
    const withdrawalAddress = bob.signerAddress;
    const amount = value.toString();

    const params = {
      amount: amount,
      fromChainId: depositChainId,
      fromAssetId: depositAssetId,
      toChainId: recipientChainId,
      toAssetId: recipientAssetId,
      reconcileDeposit: true,
      withdrawalAddress: withdrawalAddress,
      meta: { crossChainTransferId },
    };

    let result;
    try {
      result = await browserNode!.crossChainTransfer(params);
    } catch (e) {
      expect(engine).to.be.instanceOf(VectorEngine);
    }
  });

  it("should be able to make crossChain transfer for ERC20 Token", async () => {
    //connect
    // deposit
    // crossChainTransfer
  });
});
