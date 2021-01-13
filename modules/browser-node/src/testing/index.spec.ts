/* eslint-disable @typescript-eslint/no-empty-function */
import { VectorChainService } from "@connext/vector-contracts";
import { IVectorProtocol, IChannelSigner, IVectorStore } from "@connext/vector-types";
import { VectorEngine } from "@connext/vector-engine";
import { expect, getTestLoggers, getRandomBytes32 } from "@connext/vector-utils";
import { AddressZero } from "@ethersproject/constants";
import { JsonRpcProvider } from "@ethersproject/providers";
import { BigNumber } from "@ethersproject/bignumber";
import Sinon from "sinon";

import { DirectProvider, IframeChannelProvider } from "../channelProvider";
import { getFundedChannel } from "../../../protocol/src/testing/utils";
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
  let iframe: Sinon.SinonStubbedInstance<IframeChannelProvider>;
  let directProvider: Sinon.SinonStubbedInstance<DirectProvider>;
  let node: Sinon.SinonStubbedInstance<BrowserNode>;
  let connectStub: Sinon.SinonStub;

  let alice: IVectorProtocol;
  let bob: IVectorProtocol;
  let carol: IVectorProtocol;

  let depositChannelAddress: string;
  let aliceSigner: IChannelSigner;
  let bobSigner: IChannelSigner;
  let aliceStore: IVectorStore;
  let bobStore: IVectorStore;

  let recipientChannelAddress: string;
  let carolSigner: IChannelSigner;
  let carolStore: IVectorStore;

  let assetId: string;
  let transferAmount: any;
  let value: BigNumber;

  beforeEach(async () => {
    const depositChannelSetup = await getFundedChannel(
      testName,
      [
        {
          assetId: AddressZero,
          amount: ["100", "100"],
        },
        {
          assetId: env.chainAddresses[depositChainId].testTokenAddress,
          amount: ["100", "100"],
        },
      ],
      depositChainId,
    );
    console.log(depositChannelSetup);

    bob = depositChannelSetup.bob.protocol;
    bobSigner = depositChannelSetup.bob.signer;
    bobStore = depositChannelSetup.bob.store;
    depositChannelAddress = depositChannelSetup.channel.channelAddress;

    const recipientChannelSetup = await getFundedChannel(
      testName,
      [
        {
          assetId: AddressZero,
          amount: ["100", "100"],
        },
        {
          assetId: env.chainAddresses[recipientChainId].testTokenAddress,
          amount: ["100", "100"],
        },
      ],
      recipientChainId,
      depositChannelSetup.alice,
    );
    console.log(recipientChannelSetup);

    alice = recipientChannelSetup.alice.protocol;
    aliceSigner = recipientChannelSetup.alice.signer;
    aliceStore = recipientChannelSetup.alice.store;
    carol = recipientChannelSetup.bob.protocol;
    carolSigner = recipientChannelSetup.bob.signer;
    carolStore = recipientChannelSetup.bob.store;
    recipientChannelAddress = recipientChannelSetup.channel.channelAddress;

    directProvider = Sinon.createStubInstance(DirectProvider);
    node = Sinon.createStubInstance(BrowserNode);
    // Set test constants
    assetId = AddressZero;
    transferAmount = "1";
    iframe = Sinon.createStubInstance(IframeChannelProvider);
    connectStub = Sinon.stub(IframeChannelProvider, "connect");
    value = BigNumber.from("1000");
  });

  afterEach(async () => {
    Sinon.restore();
  });

  // Test should validate:
  // - store calls when channel is updated
  // - event emission is done properly
  // - update on latest channel corresponds to input params
  it("should be able to make crossChain transfer for ETH", async () => {
    //connect
    const browserNode = new BrowserNode({
      routerPublicIdentifier: alice.publicIdentifier,
      supportedChains: [depositChainId, recipientChainId],
      chainProviders: { [depositChainId]: "http://localhost:8545", [recipientChainId]: "http://localhost:8546" },
    });

    connectStub.resolves(directProvider);
    directProvider.send
      .onFirstCall()
      .resolves({ publicIdentifier: bob.publicIdentifier, signerAddress: bob.signerAddress });

    directProvider.send
      .onSecondCall()
      .resolves([{ publicIdentifier: bob.publicIdentifier, signerAddress: bob.signerAddress, index: 0 }]);

    await browserNode.init();

    const crossChainTransferId = getRandomBytes32();
    const withdrawalAddress = carol.signerAddress;
    const amount = value.toString();

    const params = {
      amount: amount,
      fromChainId: depositChainId,
      fromAssetId: env.chainAddresses[depositChainId].testTokenAddress,
      toChainId: recipientChainId,
      toAssetId: env.chainAddresses[recipientChainId].testTokenAddress,
      reconcileDeposit: true,
      withdrawalAddress: withdrawalAddress,
      meta: { crossChainTransferId },
    };

    let result;
    try {
      result = await browserNode!.crossChainTransfer(params);
    } catch (e) {
      expect(result).to.be.instanceOf(VectorEngine);
    }
  });

  it("should be able to make crossChain transfer for ERC20 Token", async () => {
    //connect
    // deposit
    // crossChainTransfer
  });
});
