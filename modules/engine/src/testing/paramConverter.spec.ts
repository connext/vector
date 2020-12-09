import {
  CreateTransferParams,
  DEFAULT_TRANSFER_TIMEOUT,
  EngineParams,
  FullChannelState,
  FullTransferState,
  HashlockTransferState,
  RegisteredTransfer,
  ResolveTransferParams,
  Result,
  TransferNames,
  ChainError,
  UpdateType,
} from "@connext/vector-types";
import {
  createTestChannelState,
  createTestChannelStateWithSigners,
  createTestFullHashlockTransferState,
  getRandomAddress,
  getRandomBytes32,
  getRandomChannelSigner,
  getRandomIdentifier,
  mkAddress,
} from "@connext/vector-utils";
import { expect } from "chai";
import Sinon from "sinon";
import { VectorChainReader, WithdrawCommitment } from "@connext/vector-contracts";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";

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
  const chainAddresses = { ...env.chainAddresses };
  const withdrawRegisteredInfo: RegisteredTransfer = {
    definition: mkAddress("0xdef"),
    resolverEncoding: "resolve",
    stateEncoding: "state",
    name: TransferNames.Withdraw,
  };
  const transferRegisteredInfo: RegisteredTransfer = {
    definition: mkAddress("0xdef"),
    resolverEncoding: "resolve",
    stateEncoding: "state",
    name: TransferNames.HashlockTransfer,
  };
  let chainReader: Sinon.SinonStubbedInstance<VectorChainReader>;

  beforeEach(() => {
    chainReader = Sinon.createStubInstance(VectorChainReader);
    chainReader.getBlockNumber.resolves(Result.ok<number>(110));
  });

  afterEach(() => Sinon.restore());

  describe("convertConditionalTransferParams", () => {
    beforeEach(() => {
      chainReader.getRegisteredTransferByName.resolves(Result.ok<RegisteredTransfer>(transferRegisteredInfo));

      chainReader.getRegisteredTransferByDefinition.resolves(Result.ok<RegisteredTransfer>(transferRegisteredInfo));
    });

    const generateParams = (bIsRecipient = false, receipientChainId?: number): EngineParams.ConditionalTransfer => {
      const hashlockState: Omit<HashlockTransferState, "balance"> = {
        lockHash: getRandomBytes32(),
        expiry: "45000",
      };
      return {
        channelAddress: mkAddress("0xa"),
        amount: "8",
        assetId: mkAddress("0x0"),
        recipient: bIsRecipient ? signerB.publicIdentifier : getRandomIdentifier(),
        recipientChainId: receipientChainId ?? 1,
        recipientAssetId: mkAddress("0x1"),
        type: TransferNames.HashlockTransfer,
        details: hashlockState,
        meta: {
          message: "test",
          routingId: getRandomBytes32(),
        },
      };
    };

    it("should fail if params.type is a name and chainReader.getRegisteredTransferByName fails", async () => {
      chainReader.getRegisteredTransferByName.resolves(Result.fail(new ChainError("Failure")));
      const params: any = generateParams();
      // Set incorrect type
      params.conditionType = "FailingTest";
      const { channel: channelState } = createTestChannelState(UpdateType.deposit, {
        channelAddress: params.channelAddress,
        networkContext: {
          ...chainAddresses[chainId],
          chainId,
          providerUrl,
        },
      });
      const ret = await convertConditionalTransferParams(params, signerA, channelState, chainAddresses, chainReader);
      expect(ret.isError).to.be.true;
      expect(ret.getError()).to.contain(new InvalidTransferType("Failure"));
    });

    it("should fail if params.type is an address and chainReader.getRegisteredTransferByDefinition fails", async () => {
      chainReader.getRegisteredTransferByDefinition.resolves(Result.fail(new ChainError("Failure")));
      const params: any = generateParams();
      // Set incorrect type
      params.type = getRandomAddress();
      const { channel: channelState } = createTestChannelState(UpdateType.deposit, {
        channelAddress: params.channelAddress,
        networkContext: {
          ...chainAddresses[chainId],
          chainId,
          providerUrl,
        },
      });
      const ret = await convertConditionalTransferParams(params, signerA, channelState, chainAddresses, chainReader);
      expect(ret.isError).to.be.true;
      expect(ret.getError()).to.contain(new InvalidTransferType("Failure"));
    });

    it("should fail if initiator is receiver for same chain/network", async () => {
      const params = generateParams(true, chainId);
      const channelState: FullChannelState = createTestChannelStateWithSigners([signerA, signerB], "deposit", {
        channelAddress: params.channelAddress,
        networkContext: {
          ...chainAddresses[chainId],
          chainId,
          providerUrl,
        },
      });

      const ret = await convertConditionalTransferParams(params, signerB, channelState, chainAddresses, chainReader);

      expect(ret.isError).to.be.true;
      expect(ret.getError()).to.contain(new InvalidTransferType("An initiator cannot be a receiver on the same chain"));
    });

    describe.skip("should work for A", () => {
      it("should work with provided params.recipientChainId", async () => {});
      it("should work with default params.recipientChainId", async () => {});
      it("should work with provided params.timeout", async () => {});
      it("should work with default params.timeout", async () => {});
      it("should work with provided params.recipientAssetId", async () => {});
      it("should work with provided params.assetId", async () => {});
      it("should work with in-channel recipient", async () => {});
      it("should work with out-of-channel recipient", async () => {});
      it("should work for A with out-of-channel recipient and given routingId", async () => {});
      it("should work when params.type is a name", async () => {});
      it("should work when params.type is an address (transferDefinition)", async () => {});
    });
    describe.skip("should work for B", () => {
      it("should work with provided params.recipientChainId", async () => {});
      it("should work with default params.recipientChainId", async () => {});
      it("should work with provided params.timeout", async () => {});
      it("should work with default params.timeout", async () => {});
      it("should work with provided params.recipientAssetId", async () => {});
      it("should work with provided params.assetId", async () => {});
      it("should work with in-channel recipient", async () => {});
      it("should work with out-of-channel recipient", async () => {});
      it("should work for A with out-of-channel recipient and given routingId", async () => {});
      it("should work when params.type is a name", async () => {});
      it("should work when params.type is an address (transferDefinition)", async () => {});
    });

    it("should work for A", async () => {
      const params = generateParams();
      const channelState: FullChannelState = createTestChannelStateWithSigners([signerA, signerB], UpdateType.deposit, {
        channelAddress: params.channelAddress,
        networkContext: {
          ...chainAddresses[chainId],
          chainId,
          providerUrl,
        },
      });
      const ret: CreateTransferParams = (
        await convertConditionalTransferParams(params, signerA, channelState, chainAddresses, chainReader)
      ).getValue();
      expect(ret).to.deep.eq({
        channelAddress: channelState.channelAddress,
        balance: {
          amount: [params.amount, "0"],
          to: [signerA.address, signerB.address],
        },
        assetId: params.assetId,
        transferDefinition: transferRegisteredInfo.definition,
        transferInitialState: {
          lockHash: params.details.lockHash,
          expiry: params.details.expiry,
        },
        timeout: DEFAULT_TRANSFER_TIMEOUT.toString(),
        meta: {
          requireOnline: false,
          routingId: params.meta!.routingId,
          path: [
            {
              recipientAssetId: params.recipientAssetId,
              recipientChainId: params.recipientChainId,
              recipient: params.recipient,
            },
          ],
          ...params.meta!,
        },
      });
    });

    it("should work for B", async () => {
      const params = generateParams();
      const channelState: FullChannelState = createTestChannelStateWithSigners([signerA, signerB], UpdateType.deposit, {
        channelAddress: params.channelAddress,
        networkContext: {
          ...chainAddresses[chainId],
          chainId,
          providerUrl,
        },
      });
      const ret: CreateTransferParams = (
        await convertConditionalTransferParams(params, signerB, channelState, chainAddresses, chainReader)
      ).getValue();
      expect(ret).to.deep.eq({
        channelAddress: channelState.channelAddress,
        balance: {
          amount: [params.amount, "0"],
          to: [signerB.address, signerA.address],
        },
        assetId: params.assetId,
        transferDefinition: transferRegisteredInfo.definition,
        transferInitialState: {
          lockHash: params.details.lockHash,
          expiry: params.details.expiry,
        },
        timeout: DEFAULT_TRANSFER_TIMEOUT.toString(),
        meta: {
          requireOnline: false,
          routingId: params.meta!.routingId,
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
  });

  describe("convertResolveConditionParams", () => {
    const generateParams = (): EngineParams.ResolveTransfer => {
      return {
        channelAddress: mkAddress("0xa"),
        transferId: getRandomBytes32(),
        transferResolver: {
          preImage: getRandomBytes32(),
        },
        meta: {
          message: "test",
        },
      };
    };

    it("should work", async () => {
      const params = generateParams();
      const transferState: FullTransferState = createTestFullHashlockTransferState({
        channelAddress: params.channelAddress,
      });
      const ret: ResolveTransferParams = convertResolveConditionParams(params, transferState).getValue();
      expect(ret).to.deep.eq({
        channelAddress: params.channelAddress,
        transferId: transferState.transferId,
        transferResolver: {
          preImage: params.transferResolver.preImage,
        },
        meta: {
          details: params.meta,
        },
      });
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
        callTo: AddressZero,
        callData: "0x",
      };
    };

    beforeEach(() => {
      chainReader.getRegisteredTransferByName.resolves(Result.ok<RegisteredTransfer>(withdrawRegisteredInfo));

      chainReader.getRegisteredTransferByDefinition.resolves(Result.ok<RegisteredTransfer>(withdrawRegisteredInfo));
    });

    const generateChainData = (params, channel) => {
      const commitment = new WithdrawCommitment(
        channel.channelAddress,
        channel.alice,
        channel.bob,
        params.recipient,
        params.assetId,
        params.amount,
        channel.nonce.toString(),
      );
      return commitment.hashToSign();
    };

    it.skip("should fail if signer fails to sign message", async () => {});
    it.skip("should fail if it cannot get registry information", async () => {});
    describe.skip("should work for A", async () => {
      it("should work with provided params.fee", async () => {});
      it("should work without provided params.fee", async () => {});
      it("should work with provided params.callTo", async () => {});
      it("should work without provided params.callTo", async () => {});
      it("should work with provided params.callData", async () => {});
      it("should work without provided params.callData", async () => {});
    });
    describe.skip("should work for B", async () => {
      it("should work with provided params.fee", async () => {});
      it("should work without provided params.fee", async () => {});
      it("should work with provided params.callTo", async () => {});
      it("should work without provided params.callTo", async () => {});
      it("should work with provided params.callData", async () => {});
      it("should work without provided params.callData", async () => {});
    });

    it("should work for A", async () => {
      const params = generateParams();
      const channelState: FullChannelState = createTestChannelStateWithSigners([signerA, signerB], UpdateType.deposit, {
        channelAddress: params.channelAddress,
        networkContext: {
          ...chainAddresses[chainId],
          chainId,
          providerUrl,
        },
      });
      const withdrawHash = generateChainData(params, channelState);
      const signature = await signerA.signMessage(withdrawHash);

      const ret: CreateTransferParams = (
        await convertWithdrawParams(params, signerA, channelState, chainAddresses, chainReader)
      ).getValue();
      expect(ret).to.deep.eq({
        channelAddress: channelState.channelAddress,
        balance: {
          amount: [BigNumber.from(params.amount).add(params.fee).toString(), "0"],
          to: [params.recipient, channelState.bob],
        },
        assetId: params.assetId,
        transferDefinition: withdrawRegisteredInfo.definition,
        transferInitialState: {
          initiatorSignature: signature,
          initiator: signerA.address,
          responder: signerB.address,
          data: withdrawHash,
          nonce: channelState.nonce.toString(),
          fee: params.fee ?? "0",
          callTo: params.callTo ?? AddressZero,
          callData: params.callData ?? "0x",
        },
        timeout: DEFAULT_TRANSFER_TIMEOUT.toString(),
        meta: {
          withdrawNonce: channelState.nonce.toString(),
        },
      });
    });

    it("should work for B", async () => {
      const params = generateParams();
      const channelState: FullChannelState = createTestChannelStateWithSigners([signerA, signerB], UpdateType.deposit, {
        channelAddress: params.channelAddress,
        networkContext: {
          ...chainAddresses[chainId],
          chainId,
          providerUrl,
        },
      });
      const withdrawHash = generateChainData(params, channelState);
      const signature = await signerB.signMessage(withdrawHash);

      const ret: CreateTransferParams = (
        await convertWithdrawParams(params, signerB, channelState, chainAddresses, chainReader)
      ).getValue();
      expect(ret).to.deep.eq({
        channelAddress: channelState.channelAddress,
        balance: {
          amount: [BigNumber.from(params.amount).add(params.fee).toString(), "0"],
          to: [params.recipient, channelState.alice],
        },
        assetId: params.assetId,
        transferDefinition: withdrawRegisteredInfo.definition,
        transferInitialState: {
          initiatorSignature: signature,
          responder: signerA.address,
          initiator: signerB.address,
          data: withdrawHash,
          nonce: channelState.nonce.toString(),
          fee: params.fee ?? "0",
          callTo: params.callTo ?? AddressZero,
          callData: params.callData ?? "0x",
        },
        timeout: DEFAULT_TRANSFER_TIMEOUT.toString(),
        meta: {
          withdrawNonce: channelState.nonce.toString(),
        },
      });
    });
  });
});
