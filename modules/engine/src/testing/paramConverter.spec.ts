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
  getRandomIdentifier,
  mkAddress,
  ChannelSigner,
} from "@connext/vector-utils";
import { expect } from "chai";
import Sinon from "sinon";
import { VectorChainReader, WithdrawCommitment } from "@connext/vector-contracts";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";

import {
  convertConditionalTransferParams,
  convertResolveConditionParams,
  convertWithdrawParams,
} from "../paramConverter";
import { ParameterConversionError } from "../errors";

import { env } from "./env";

describe("ParamConverter", () => {
  const chainId = parseInt(Object.keys(env.chainProviders)[0]);
  const providerUrl = env.chainProviders[chainId];
  const chainAddresses = { ...env.chainAddresses };
  const withdrawRegisteredInfo: RegisteredTransfer = {
    definition: mkAddress("0xdef"),
    resolverEncoding: "resolve",
    stateEncoding: "state",
    name: TransferNames.Withdraw,
    encodedCancel: "encodedCancel",
  };
  const transferRegisteredInfo: RegisteredTransfer = {
    definition: mkAddress("0xdef"),
    resolverEncoding: "resolve",
    stateEncoding: "state",
    name: TransferNames.HashlockTransfer,
    encodedCancel: "encodedCancel",
  };
  let chainReader: Sinon.SinonStubbedInstance<VectorChainReader>;
  let signerA: Sinon.SinonStubbedInstance<ChannelSigner>;
  let signerB: Sinon.SinonStubbedInstance<ChannelSigner>;

  beforeEach(() => {
    chainReader = Sinon.createStubInstance(VectorChainReader);
    signerA = Sinon.createStubInstance(ChannelSigner);
    signerB = Sinon.createStubInstance(ChannelSigner);

    signerA.signMessage.resolves("success");
    signerB.signMessage.resolves("success");
    chainReader.getBlockNumber.resolves(Result.ok<number>(110));
  });

  afterEach(() => Sinon.restore());

  describe("convertConditionalTransferParams", () => {
    beforeEach(() => {
      chainReader.getRegisteredTransferByName.resolves(Result.ok<RegisteredTransfer>(transferRegisteredInfo));

      chainReader.getRegisteredTransferByDefinition.resolves(Result.ok<RegisteredTransfer>(transferRegisteredInfo));
    });

    const generateParams = (bIsRecipient = false): EngineParams.ConditionalTransfer => {
      const hashlockState: Omit<HashlockTransferState, "balance"> = {
        lockHash: getRandomBytes32(),
        expiry: "45000",
      };
      return {
        channelAddress: mkAddress("0xa"),
        amount: "8",
        assetId: mkAddress("0x0"),
        recipient: bIsRecipient ? signerB.publicIdentifier : getRandomIdentifier(),
        recipientChainId: chainId,
        recipientAssetId: mkAddress("0x1"),
        type: TransferNames.HashlockTransfer,
        details: hashlockState,
        timeout: DEFAULT_TRANSFER_TIMEOUT.toString(),
        meta: {
          message: "test",
          routingId: getRandomBytes32(),
        },
      };
    };

    it("should fail if params.type is a name and chainReader.getRegisteredTransferByName fails", async () => {
      const chainErr = new ChainError("Failure");
      chainReader.getRegisteredTransferByName.resolves(Result.fail(chainErr));
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
      const err = ret.getError();
      expect(err?.message).to.be.eq(ParameterConversionError.reasons.FailedToGetRegisteredTransfer);
      expect(err?.context.channelAddress).to.be.eq(channelState.channelAddress);
      expect(err?.context.publicIdentifier).to.be.eq(signerA.publicIdentifier);
      expect(err?.context.params).to.be.deep.eq(params);
      expect(err?.context.registryError).to.be.deep.eq(chainErr.toJson());
    });

    it("should fail if params.type is an address and chainReader.getRegisteredTransferByDefinition fails", async () => {
      const chainErr = new ChainError("Failure");
      chainReader.getRegisteredTransferByDefinition.resolves(Result.fail(chainErr));
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
      const err = ret.getError();
      expect(err?.message).to.be.eq(ParameterConversionError.reasons.FailedToGetRegisteredTransfer);
      expect(err?.context.channelAddress).to.be.eq(channelState.channelAddress);
      expect(err?.context.publicIdentifier).to.be.eq(signerA.publicIdentifier);
      expect(err?.context.params).to.be.deep.eq(params);
      expect(err?.context.registryError).to.be.deep.eq(chainErr.toJson());
    });

    it("should fail if initiator is receiver for same chain/network", async () => {
      const params = generateParams(true);
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
      const err = ret.getError();
      expect(err?.message).to.be.eq(ParameterConversionError.reasons.CannotSendToSelf);
      expect(err?.context.channelAddress).to.be.eq(channelState.channelAddress);
      expect(err?.context.publicIdentifier).to.be.eq(signerA.publicIdentifier);
      expect(err?.context.params).to.be.deep.eq(params);
    });

    const runTest = async (params: any, result: CreateTransferParams, isUserA: boolean) => {
      expect(result).to.deep.eq({
        channelAddress: params.channelAddress,
        balance: {
          amount: [params.amount, "0"],
          to: isUserA ? [signerA.address, signerB.address] : [signerB.address, signerA.address],
        },
        assetId: params.assetId,
        transferDefinition: transferRegisteredInfo.definition,
        transferInitialState: {
          lockHash: params.details.lockHash,
          expiry: params.details.expiry,
        },
        timeout: params.timeout,
        meta: {
          requireOnline: true,
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
    };

    const testSetup = async (params: any, isUserA: boolean) => {
      const channelState: FullChannelState = createTestChannelStateWithSigners([signerA, signerB], UpdateType.deposit, {
        channelAddress: params.channelAddress,
        networkContext: {
          ...chainAddresses[chainId],
          chainId,
          providerUrl,
        },
      });

      const result = isUserA
        ? await convertConditionalTransferParams(params, signerA, channelState, chainAddresses, chainReader)
        : await convertConditionalTransferParams(params, signerB, channelState, chainAddresses, chainReader);

      return result;
    };

    const users = ["A", "B"];
    for (const user of users) {
      let isUserA = false;
      if (user === "A") {
        isUserA = true;
      }
      const baseParams = generateParams();

      describe(`should work for ${user}`, () => {
        it("should work with provided params.recipientChainId", async () => {
          const params = { ...baseParams, recipientChainId: 2 };

          const result = await testSetup(params, isUserA);
          runTest(params, result.getValue(), isUserA);
        });
        it("should work with default params.recipientChainId", async () => {
          const params = { ...baseParams, recipientChainId: undefined };

          const result = await testSetup(params, isUserA);

          const expectedParams = { ...baseParams, recipientChainId: chainId };
          runTest(expectedParams, result.getValue(), isUserA);
        });
        it("should work with provided params.timeout", async () => {
          const params = { ...baseParams, timeout: "100000" };
          const result = await testSetup(params, isUserA);
          runTest(params, result.getValue(), isUserA);
        });
        it("should work with default params.timeout", async () => {
          const params = { ...baseParams, timeout: undefined };

          const result = await testSetup(params, isUserA);

          const expectedParams = { ...baseParams, timeout: DEFAULT_TRANSFER_TIMEOUT.toString() };
          runTest(expectedParams, result.getValue(), isUserA);
        });
        it("should work with provided params.recipientAssetId", async () => {
          const params = { ...baseParams, recipientAssetId: AddressZero };

          const result = await testSetup(params, isUserA);
          runTest(params, result.getValue(), isUserA);
        });
        it("should work with provided params.assetId", async () => {
          const params = { ...baseParams, assetId: AddressZero };
          const result = await testSetup(params, isUserA);
          runTest(params, result.getValue(), isUserA);
        });
        it("should work with in-channel recipient", async () => {
          const params = { ...baseParams };
          const result = await testSetup(params, isUserA);
          runTest(params, result.getValue(), isUserA);
        });
        it("should work with out-of-channel recipient", async () => {
          const params = generateParams(false);

          const result = await testSetup(params, isUserA);
          runTest(params, result.getValue(), isUserA);
        });
        it("should work for A with out-of-channel recipient and given routingId", async () => {
          let params = generateParams(false);
          params = {
            ...params,
            recipient: getRandomIdentifier(),
            meta: { ...params.meta, routingId: getRandomBytes32() },
          };

          const result = await testSetup(params, isUserA);
          runTest(params, result.getValue(), isUserA);
        });
        it("should work when params.type is a name", async () => {
          const params = { ...baseParams, type: TransferNames.Withdraw };

          const result = await testSetup(params, isUserA);
          runTest(params, result.getValue(), isUserA);
        });
        it("should work when params.type is an address (transferDefinition)", async () => {
          const params = { ...baseParams, type: getRandomBytes32() };

          const result = await testSetup(params, isUserA);
          runTest(params, result.getValue(), isUserA);
        });
      });
    }
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
          ...transferState.meta,
          ...params.meta,
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

    const testSetup = async (params: any, isUserA: boolean) => {
      const channelState = createTestChannelStateWithSigners([signerA, signerB], UpdateType.deposit, {
        channelAddress: params.channelAddress,
        networkContext: {
          ...chainAddresses[chainId],
          chainId,
          providerUrl,
        },
      });
      const result = isUserA
        ? await convertWithdrawParams(params, signerA, channelState, chainAddresses, chainReader)
        : await convertWithdrawParams(params, signerB, channelState, chainAddresses, chainReader);

      return { channelState, result };
    };

    const runTest = async (
      params: any,
      channelState: FullChannelState,
      result: CreateTransferParams,
      isUserA: boolean,
    ) => {
      const withdrawHash = generateChainData(params, channelState);
      const signature = isUserA ? await signerA.signMessage(withdrawHash) : await signerB.signMessage(withdrawHash);
      expect(result).to.deep.eq({
        channelAddress: channelState.channelAddress,
        balance: {
          amount: [BigNumber.from(params.amount).add(params.fee).toString(), "0"],
          to: isUserA ? [params.recipient, channelState.bob] : [params.recipient, channelState.alice],
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
    };

    it("should fail if signer fails to sign message", async () => {
      const params = generateParams();
      signerA.signMessage.rejects(new Error("fail"));
      const { channelState, result } = await testSetup(params, true);

      expect(result.isError).to.be.true;
      expect(result.getError()).to.contain(new Error(`${signerA.publicIdentifier} failed to sign: fail`));
    });
    it("should fail if it cannot get registry information", async () => {
      const params = generateParams();
      const chainErr = new ChainError("Failure");
      chainReader.getRegisteredTransferByName.resolves(Result.fail(chainErr));
      const { channelState, result } = await testSetup(params, true);

      expect(result.isError).to.be.true;
      const err = result.getError();
      expect(err?.message).to.be.eq(ParameterConversionError.reasons.FailedToGetRegisteredTransfer);
      expect(err?.context.channelAddress).to.be.eq(channelState.channelAddress);
      expect(err?.context.publicIdentifier).to.be.eq(signerA.publicIdentifier);
      expect(err?.context.params).to.be.deep.eq(params);
      expect(err?.context.registryError).to.be.deep.eq(chainErr.toJson());
    });

    const users = ["A", "B"];
    for (const user of users) {
      let isUserA = false;
      if (user === "A") {
        isUserA = true;
      }
      const baseParams = generateParams();

      describe(`should work for ${user}`, () => {
        it("should work with provided params.fee", async () => {
          const params = { ...baseParams, fee: "2" };

          const { channelState, result } = await testSetup(params, true);

          runTest(params, channelState, result.getValue(), isUserA);
        });
        it("should work without provided params.fee", async () => {
          const params = { ...baseParams, fee: undefined };

          const { channelState, result } = await testSetup(params, true);
          const expectedParams = { ...baseParams, fee: "0" };
          runTest(expectedParams, channelState, result.getValue(), isUserA);
        });
        it("should work with provided params.callTo", async () => {
          const params = { ...baseParams, callTo: AddressZero };

          const { channelState, result } = await testSetup(params, true);

          runTest(params, channelState, result.getValue(), isUserA);
        });
        it("should work without provided params.callTo", async () => {
          const params = { ...baseParams, callTo: undefined };

          const { channelState, result } = await testSetup(params, true);
          const expectedParams = { ...baseParams, callTo: AddressZero };
          runTest(expectedParams, channelState, result.getValue(), isUserA);
        });
        it("should work with provided params.callData", async () => {
          const params = { ...baseParams, callData: "0x" };

          const { channelState, result } = await testSetup(params, true);

          runTest(params, channelState, result.getValue(), isUserA);
        });
        it("should work without provided params.callData", async () => {
          const params = { ...baseParams, callData: undefined };

          const { channelState, result } = await testSetup(params, true);

          const expectedParams = { ...baseParams, callData: "0x" };
          runTest(expectedParams, channelState, result.getValue(), isUserA);
        });
      });
    }
  });
});
