import {
  ChainAddresses,
  ConditionalTransferType,
  CreateTransferParams,
  DEFAULT_TRANSFER_TIMEOUT,
  EngineParams,
  FullChannelState,
  FullTransferState,
  LinkedTransferResolver,
  LinkedTransferResolverEncoding,
  LinkedTransferStateEncoding,
  ResolveTransferParams,
  WithdrawResolverEncoding,
  WithdrawStateEncoding,
} from "@connext/vector-types";
import {
  createTestChannelState,
  createTestChannelStateWithSigners,
  createTestFullLinkedTransferState,
  getRandomBytes32,
  getRandomChannelSigner,
  mkAddress,
  mkHash,
} from "@connext/vector-utils";
import { expect } from "chai";
import { WithdrawCommitment } from "@connext/vector-contracts";
import { BigNumber } from "ethers";

import { InvalidTransferType } from "../errors";
import {
  convertConditionalTransferParams,
  convertResolveConditionParams,
  convertWithdrawParams,
} from "../paramConverter";

import { env } from "./env";

describe("ParamConverter", () => {
  const chainId = parseInt(Object.keys(env.chainProviders)[0]);
  const providerUrl = env.chainProviders[chainId];
  const signerA = getRandomChannelSigner(providerUrl);
  const signerB = getRandomChannelSigner(providerUrl);
  const chainAddresses: ChainAddresses = {
    [chainId]: {
      withdrawDefinition: env.contractAddresses[chainId].Withdraw.address,
      channelFactoryAddress: env.contractAddresses[chainId].ChannelFactory.address,
      channelMastercopyAddress: env.contractAddresses[chainId].ChannelMastercopy.address,
      linkedTransferDefinition: env.contractAddresses[chainId].LinkedTransfer.address,
    },
  };

  describe("convertConditionalTransferParams", () => {
    const generateParams = (): EngineParams.ConditionalTransfer => {
      return {
        channelAddress: mkAddress("0xa"),
        amount: "8",
        assetId: mkAddress("0x0"),
        recipient: mkAddress("0xb"),
        recipientChainId: 1,
        recipientAssetId: mkAddress("0x1"),
        conditionType: ConditionalTransferType.LinkedTransfer,
        routingId: mkHash("0xtest"),
        details: {
          linkedHash: getRandomBytes32(),
        },
        meta: {
          message: "test",
        },
      };
    };

    it("should work for A", async () => {
      const params = generateParams();
      const channelState: FullChannelState = createTestChannelStateWithSigners([signerA, signerB], "setup", {
        channelAddress: params.channelAddress,
        networkContext: {
          ...chainAddresses[chainId],
          chainId,
          providerUrl,
        },
      });
      const ret: CreateTransferParams = convertConditionalTransferParams(
        params,
        signerA,
        channelState,
        chainAddresses,
      ).getValue();
      expect(ret).to.deep.eq({
        channelAddress: channelState.channelAddress,
        amount: params.amount,
        assetId: params.assetId,
        transferDefinition: channelState.networkContext.linkedTransferDefinition,
        transferInitialState: {
          balance: {
            amount: [params.amount, "0"],
            to: [signerA.address, signerB.address],
          },
          linkedHash: params.details.linkedHash,
        },
        timeout: DEFAULT_TRANSFER_TIMEOUT.toString(),
        encodings: [LinkedTransferStateEncoding, LinkedTransferResolverEncoding],
        signers: [signerA.address, signerB.address],
        meta: {
          routingId: params.routingId,
          path: [
            {
              recipientAssetId: params.recipientAssetId,
              recipientChainId: params.recipientChainId,
              recipient: params.recipient,
            },
          ],
          ...params.meta,
        },
      });
    });

    it("should work for B", async () => {
      const params = generateParams();
      const channelState: FullChannelState = createTestChannelStateWithSigners([signerA, signerB], "setup", {
        channelAddress: params.channelAddress,
        networkContext: {
          ...chainAddresses[chainId],
          chainId,
          providerUrl,
        },
      });
      const ret: CreateTransferParams = convertConditionalTransferParams(
        params,
        signerB,
        channelState,
        chainAddresses,
      ).getValue();
      expect(ret).to.deep.eq({
        channelAddress: channelState.channelAddress,
        amount: params.amount,
        assetId: params.assetId,
        transferDefinition: channelState.networkContext.linkedTransferDefinition,
        transferInitialState: {
          balance: {
            amount: [params.amount, "0"],
            to: [signerB.address, signerA.address],
          },
          linkedHash: params.details.linkedHash,
        },
        timeout: DEFAULT_TRANSFER_TIMEOUT.toString(),
        encodings: [LinkedTransferStateEncoding, LinkedTransferResolverEncoding],
        signers: [signerB.address, signerA.address],
        meta: {
          routingId: params.routingId,
          path: [
            {
              recipientAssetId: params.recipientAssetId,
              recipientChainId: params.recipientChainId,
              recipient: params.recipient,
            },
          ],
          ...params.meta,
        },
      });
    });

    it("should fail if invalid type", async () => {
      const params: any = generateParams();
      // Set incorrect type
      params.conditionType = "FailingTest";
      const channelState: FullChannelState = createTestChannelState("setup", {
        channelAddress: params.channelAddress,
        networkContext: {
          ...chainAddresses[chainId],
          chainId,
          providerUrl,
        },
      });
      const ret = convertConditionalTransferParams(params, signerA, channelState, chainAddresses);
      expect(ret.isError).to.be.true;
      expect(ret.getError()).to.contain(new InvalidTransferType(params.conditionType));
    });
  });

  describe("convertResolveConditionParams", () => {
    const generateParams = (): EngineParams.ResolveTransfer => {
      return {
        channelAddress: mkAddress("0xa"),
        conditionType: ConditionalTransferType.LinkedTransfer,
        routingId: mkHash("0xtest"),
        details: {
          preImage: getRandomBytes32(),
        } as LinkedTransferResolver,
        meta: {
          message: "test",
        },
      };
    };

    it("should work", async () => {
      const params = generateParams();
      const transferState: FullTransferState = createTestFullLinkedTransferState({
        channelAddress: params.channelAddress,
      });
      const ret: ResolveTransferParams = convertResolveConditionParams(params, transferState).getValue();
      expect(ret).to.deep.eq({
        channelAddress: params.channelAddress,
        transferId: transferState.transferId,
        transferResolver: {
          preImage: params.details.preImage,
        },
        meta: {
          routingId: params.routingId,
          details: params.meta,
        },
      });
    });

    it("should fail if invalid type", async () => {
      const params: any = generateParams();
      // Set incorrect type
      params.conditionType = "FailingTest";
      const transferState: FullTransferState = createTestFullLinkedTransferState({
        channelAddress: params.channelAddress,
      });
      const ret = convertResolveConditionParams(params, transferState);
      expect(ret.isError).to.be.true;
      expect(ret.getError()).to.contain(new InvalidTransferType(params.conditionType));
    });
  });

  describe("convertWithdrawParams", () => {
    const generateParams = () => {
      return {
        channelAddress: mkAddress("0xa"),
        amount: "8",
        assetId: mkAddress("0x0"),
        recipient: mkAddress("0xb"),
        fee: "1",
      };
    };

    const generateChainData = (params, channel) => {
      const commitment = new WithdrawCommitment(
        channel.channelAddress,
        channel.participants,
        params.recipient,
        params.assetId,
        params.amount,
        channel.nonce.toString(),
      );
      return commitment.hashToSign();
    };

    it("should work for A", async () => {
      const params = generateParams();
      const channelState: FullChannelState = createTestChannelStateWithSigners([signerA, signerB], "setup", {
        channelAddress: params.channelAddress,
        networkContext: {
          ...chainAddresses[chainId],
          chainId,
          providerUrl,
        },
      });
      const withdrawHash = generateChainData(params, channelState);
      const signature = await signerA.signMessage(withdrawHash);

      const ret: CreateTransferParams = (await convertWithdrawParams(params, signerA, channelState)).getValue();
      expect(ret).to.deep.eq({
        channelAddress: channelState.channelAddress,
        amount: BigNumber.from(params.amount)
          .add(params.fee)
          .toString(),
        assetId: params.assetId,
        transferDefinition: channelState.networkContext.withdrawDefinition,
        transferInitialState: {
          balance: {
            amount: [
              BigNumber.from(params.amount)
                .add(params.fee)
                .toString(),
              "0",
            ],
            to: [params.recipient, channelState.participants[1]],
          },
          aliceSignature: signature,
          signers: [signerA.address, signerB.address],
          data: withdrawHash,
          nonce: channelState.nonce.toString(),
          fee: params.fee ? params.fee : "0",
        },
        timeout: DEFAULT_TRANSFER_TIMEOUT.toString(),
        encodings: [WithdrawStateEncoding, WithdrawResolverEncoding],
        signers: [signerA.address, signerB.address],
        meta: {
          withdrawNonce: channelState.nonce.toString(),
        },
      });
    });

    it("should work for B", async () => {
      const params = generateParams();
      const channelState: FullChannelState = createTestChannelStateWithSigners([signerA, signerB], "setup", {
        channelAddress: params.channelAddress,
        networkContext: {
          ...chainAddresses[chainId],
          chainId,
          providerUrl,
        },
      });
      const withdrawHash = generateChainData(params, channelState);
      const signature = await signerB.signMessage(withdrawHash);

      const ret: CreateTransferParams = (await convertWithdrawParams(params, signerB, channelState)).getValue();
      expect(ret).to.deep.eq({
        channelAddress: channelState.channelAddress,
        amount: BigNumber.from(params.amount)
          .add(params.fee)
          .toString(),
        assetId: params.assetId,
        transferDefinition: channelState.networkContext.withdrawDefinition,
        transferInitialState: {
          balance: {
            amount: [
              BigNumber.from(params.amount)
                .add(params.fee)
                .toString(),
              "0",
            ],
            to: [params.recipient, channelState.participants[0]],
          },
          aliceSignature: signature,
          signers: [signerB.address, signerA.address],
          data: withdrawHash,
          nonce: channelState.nonce.toString(),
          fee: params.fee ? params.fee : "0",
        },
        timeout: DEFAULT_TRANSFER_TIMEOUT.toString(),
        signers: [signerB.address, signerA.address],
        encodings: [WithdrawStateEncoding, WithdrawResolverEncoding],
        meta: {
          withdrawNonce: channelState.nonce.toString(),
        },
      });
    });
  });
});
