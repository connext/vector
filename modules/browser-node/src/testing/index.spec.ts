/* eslint-disable @typescript-eslint/no-empty-function */
import { VectorChainService } from "@connext/vector-contracts";
import { IVectorProtocol, IChannelSigner, IVectorStore } from "@connext/vector-types";
import { VectorEngine } from "@connext/vector-engine";
import { expect, getTestLoggers, getRandomBytes32, mkAddress } from "@connext/vector-utils";
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

const depositChainId = 1337;
const withdrawChainId = 1338;
const depositAssetId = mkAddress("0x1337");
const withdrawAssetId = mkAddress("0x1338");

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
    console.log("env.chainAddresses: ", env.chainAddresses);
    const depositChannelSetup = await getFundedChannel(
      testName,
      [
        {
          assetId: AddressZero,
          amount: ["100", "100"],
        },
        {
          assetId: depositAssetId,
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
          assetId: depositAssetId,
          amount: ["100", "100"],
        },
      ],
      withdrawChainId,
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
  it.only("should be able to make crossChain transfer for ETH", async () => {
    //connect
    const browserNode = new BrowserNode({
      routerPublicIdentifier: alice.publicIdentifier,
      supportedChains: [1337, 1338],
      chainProviders: { [depositChainId]: "http://localhost:8545", [withdrawChainId]: "http://localhost:8546" },
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
      fromAssetId: depositAssetId,
      toChainId: withdrawChainId,
      toAssetId: withdrawAssetId,
      reconcileDeposit: true,
      withdrawalAddress: withdrawalAddress,
      meta: { crossChainTransferId },
    };

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
