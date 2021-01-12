import { VectorChainReader } from "@connext/vector-contracts";
import {
  ChannelSigner,
  createTestChannelUpdate,
  expect,
  getRandomChannelSigner,
  createTestChannelState,
  mkSig,
  createTestFullHashlockTransferState,
  createTestUpdateParams,
  mkAddress,
  createTestChannelStateWithSigners,
  getTransferId,
  generateMerkleTreeData,
  getRandomBytes32,
} from "@connext/vector-utils";
import {
  ChainError,
  ChannelUpdate,
  FullChannelState,
  FullTransferState,
  Result,
  UpdateType,
  Values,
  UpdateParams,
  IChannelSigner,
  DEFAULT_CHANNEL_TIMEOUT,
  DEFAULT_TRANSFER_TIMEOUT,
  MAXIMUM_TRANSFER_TIMEOUT,
  MINIMUM_TRANSFER_TIMEOUT,
  MAXIMUM_CHANNEL_TIMEOUT,
  VectorError,
} from "@connext/vector-types";
import Sinon from "sinon";
import { AddressZero } from "@ethersproject/constants";

import { OutboundChannelUpdateError, InboundChannelUpdateError, ValidationError } from "../errors";
import * as vectorUtils from "../utils";
import * as validation from "../validate";
import * as vectorUpdate from "../update";

describe("validateUpdateParams", () => {
  // Test values
  const [initiator, responder] = Array(2)
    .fill(0)
    .map((_) => getRandomChannelSigner());
  const channelAddress = mkAddress("0xccc");

  // Declare all mocks
  let chainReader: Sinon.SinonStubbedInstance<VectorChainReader>;

  // Create helpers to create valid contexts
  const createValidSetupContext = () => {
    const previousState = undefined;
    const activeTransfers = [];
    const initiatorIdentifier = initiator.publicIdentifier;
    const params = createTestUpdateParams(UpdateType.setup, {
      channelAddress,
      details: { counterpartyIdentifier: responder.publicIdentifier, timeout: DEFAULT_CHANNEL_TIMEOUT.toString() },
    });
    return { previousState, activeTransfers, initiatorIdentifier, params };
  };

  const createValidDepositContext = () => {
    const activeTransfers = [];
    const initiatorIdentifier = initiator.publicIdentifier;
    const previousState = createTestChannelStateWithSigners([initiator, responder], UpdateType.setup, {
      channelAddress,
      nonce: 1,
      timeout: DEFAULT_CHANNEL_TIMEOUT.toString(),
    });
    const params = createTestUpdateParams(UpdateType.deposit, {
      channelAddress,
      details: {
        assetId: AddressZero,
      },
    });
    return { previousState, activeTransfers, initiatorIdentifier, params };
  };

  const createValidCreateContext = () => {
    const activeTransfers = [];
    const initiatorIdentifier = initiator.publicIdentifier;
    const previousState = createTestChannelStateWithSigners([initiator, responder], UpdateType.deposit, {
      channelAddress,
      nonce: 4,
      timeout: DEFAULT_CHANNEL_TIMEOUT.toString(),
      balances: [
        { to: [initiator.address, responder.address], amount: ["7", "17"] },
        { to: [initiator.address, responder.address], amount: ["14", "12"] },
      ],
      assetIds: [AddressZero, mkAddress("0xaaa")],
      processedDepositsA: ["10", "6"],
      processedDepositsB: ["14", "20"],
    });
    const transfer = createTestFullHashlockTransferState({
      channelAddress,
      initiator: initiator.address,
      responder: responder.address,
      transferTimeout: MINIMUM_TRANSFER_TIMEOUT.toString(),
      transferDefinition: mkAddress("0xdef"),
      assetId: AddressZero,
      transferId: getTransferId(
        channelAddress,
        previousState.nonce.toString(),
        mkAddress("0xdef"),
        MINIMUM_TRANSFER_TIMEOUT.toString(),
      ),
      balance: { to: [initiator.address, responder.address], amount: ["3", "0"] },
    });
    const params = createTestUpdateParams(UpdateType.create, {
      channelAddress,
      details: {
        balance: { ...transfer.balance },
        assetId: transfer.assetId,
        transferDefinition: transfer.transferDefinition,
        transferInitialState: { ...transfer.transferState },
        timeout: transfer.transferTimeout,
      },
    });
    return { previousState, activeTransfers, initiatorIdentifier, params, transfer };
  };

  const createValidResolveContext = () => {
    const nonce = 4;
    const transfer = createTestFullHashlockTransferState({
      channelAddress,
      initiator: initiator.address,
      responder: responder.address,
      transferTimeout: DEFAULT_TRANSFER_TIMEOUT.toString(),
      transferDefinition: mkAddress("0xdef"),
      assetId: AddressZero,
      transferId: getTransferId(
        channelAddress,
        nonce.toString(),
        mkAddress("0xdef"),
        DEFAULT_TRANSFER_TIMEOUT.toString(),
      ),
      balance: { to: [initiator.address, responder.address], amount: ["3", "0"] },
      transferResolver: undefined,
    });
    const { root } = generateMerkleTreeData([transfer]);
    const previousState = createTestChannelStateWithSigners([initiator, responder], UpdateType.deposit, {
      channelAddress,
      nonce,
      timeout: DEFAULT_CHANNEL_TIMEOUT.toString(),
      balances: [
        { to: [initiator.address, responder.address], amount: ["7", "17"] },
        { to: [initiator.address, responder.address], amount: ["14", "12"] },
      ],
      assetIds: [AddressZero, mkAddress("0xaaa")],
      processedDepositsA: ["10", "6"],
      processedDepositsB: ["14", "20"],
      merkleRoot: root,
    });
    const params = createTestUpdateParams(UpdateType.resolve, {
      channelAddress,
      details: { transferId: transfer.transferId, transferResolver: { preImage: getRandomBytes32() } },
    });
    return {
      previousState,
      activeTransfers: [transfer],
      initiatorIdentifier: responder.publicIdentifier,
      params,
      transfer,
    };
  };

  const callAndVerifyError = async (
    signer: IChannelSigner,
    params: UpdateParams<any>,
    state: FullChannelState | undefined,
    activeTransfers: FullTransferState[],
    initiatorIdentifier: string,
    message: Values<typeof ValidationError.reasons>,
    context: any = {},
  ) => {
    const result = await validation.validateUpdateParams(
      signer,
      chainReader,
      params,
      state,
      activeTransfers,
      initiatorIdentifier,
    );
    const error = result.getError();
    expect(error).to.be.ok;
    expect(error).to.be.instanceOf(ValidationError);
    expect(error?.message).to.be.eq(message);
    expect(error?.context).to.containSubset(context ?? {});
    expect(error?.context.state).to.be.deep.eq(state);
    expect(error?.context.params).to.be.deep.eq(params);
  };

  beforeEach(() => {
    // Set mocks (default to no error)
    chainReader = Sinon.createStubInstance(VectorChainReader);
    chainReader.getChannelAddress.resolves(Result.ok(channelAddress));
    chainReader.create.resolves(Result.ok(true));
  });

  afterEach(() => {
    Sinon.restore();
  });

  it("should fail if no previous state and is not a setup update", async () => {
    const { activeTransfers, initiatorIdentifier, params } = createValidDepositContext();
    await callAndVerifyError(
      initiator,
      params,
      undefined,
      activeTransfers,
      initiatorIdentifier,
      ValidationError.reasons.ChannelNotFound,
    );
  });

  it("should fail if previous state is in dispute", async () => {
    const { previousState, activeTransfers, initiatorIdentifier, params } = createValidDepositContext();
    previousState.inDispute = true;
    await callAndVerifyError(
      initiator,
      params,
      previousState,
      activeTransfers,
      initiatorIdentifier,
      ValidationError.reasons.InDispute,
    );
  });

  it("should fail if params.channelAddress !== previousState.channelAddress", async () => {
    const { previousState, activeTransfers, initiatorIdentifier, params } = createValidDepositContext();
    previousState.channelAddress = mkAddress("0xddddcccc33334444");
    await callAndVerifyError(
      initiator,
      params,
      previousState,
      activeTransfers,
      initiatorIdentifier,
      ValidationError.reasons.InvalidChannelAddress,
    );
  });

  it("should fail if defundNonces.length !== assetIds.length", async () => {
    const { previousState, activeTransfers, initiatorIdentifier, params } = createValidDepositContext();
    previousState.defundNonces = [...previousState.defundNonces, "1"];
    await callAndVerifyError(
      initiator,
      params,
      previousState,
      activeTransfers,
      initiatorIdentifier,
      ValidationError.reasons.InvalidArrayLength,
    );
  });
  it("should fail if balances.length !== assetIds.length", async () => {
    const { previousState, activeTransfers, initiatorIdentifier, params } = createValidDepositContext();
    previousState.balances = [];
    await callAndVerifyError(
      initiator,
      params,
      previousState,
      activeTransfers,
      initiatorIdentifier,
      ValidationError.reasons.InvalidArrayLength,
    );
  });
  it("should fail if processedDepositsA.length !== assetIds.length", async () => {
    const { previousState, activeTransfers, initiatorIdentifier, params } = createValidDepositContext();
    previousState.processedDepositsA = [...previousState.processedDepositsA, "1"];
    await callAndVerifyError(
      initiator,
      params,
      previousState,
      activeTransfers,
      initiatorIdentifier,
      ValidationError.reasons.InvalidArrayLength,
    );
  });
  it("should fail if defundNonces.processedDepositsB !== assetIds.length", async () => {
    const { previousState, activeTransfers, initiatorIdentifier, params } = createValidDepositContext();
    previousState.processedDepositsB = [...previousState.processedDepositsB, "1"];
    await callAndVerifyError(
      initiator,
      params,
      previousState,
      activeTransfers,
      initiatorIdentifier,
      ValidationError.reasons.InvalidArrayLength,
    );
  });

  describe("setup params", () => {
    it("should work for the initiator", async () => {
      const { previousState, activeTransfers, initiatorIdentifier, params } = createValidSetupContext();
      const result = await validation.validateUpdateParams(
        initiator,
        chainReader,
        params,
        previousState,
        activeTransfers,
        initiatorIdentifier,
      );
      expect(result.getError()).to.be.undefined;
      expect(chainReader.getChannelAddress.callCount).to.be.eq(1);
    });

    it("should work for the responder", async () => {
      const { previousState, activeTransfers, initiatorIdentifier, params } = createValidSetupContext();
      const result = await validation.validateUpdateParams(
        responder,
        chainReader,
        params,
        previousState,
        activeTransfers,
        initiatorIdentifier,
      );
      expect(result.getError()).to.be.undefined;
      expect(chainReader.getChannelAddress.callCount).to.be.eq(1);
    });

    it("should fail if there is a previous state", async () => {
      const { activeTransfers, initiatorIdentifier, params } = createValidSetupContext();
      await callAndVerifyError(
        initiator,
        params,
        createTestChannelState(UpdateType.setup).channel,
        activeTransfers,
        initiatorIdentifier,
        ValidationError.reasons.ChannelAlreadySetup,
      );
    });

    it("should fail if chainReader.getChannelAddress fails", async () => {
      const { activeTransfers, initiatorIdentifier, params, previousState } = createValidSetupContext();
      const chainErr = new ChainError("fail");
      chainReader.getChannelAddress.resolves(Result.fail(chainErr));
      await callAndVerifyError(
        initiator,
        params,
        previousState,
        activeTransfers,
        initiatorIdentifier,
        ValidationError.reasons.ChainServiceFailure,
        { chainServiceMethod: "getChannelAddress", chainServiceError: VectorError.jsonify(chainErr) },
      );
    });

    it("should fail if channelAddress is miscalculated", async () => {
      const { activeTransfers, initiatorIdentifier, params, previousState } = createValidSetupContext();
      chainReader.getChannelAddress.resolves(Result.ok(mkAddress("0x55555")));
      await callAndVerifyError(
        initiator,
        params,
        previousState,
        activeTransfers,
        initiatorIdentifier,
        ValidationError.reasons.InvalidChannelAddress,
      );
    });
    it("should fail if timeout is below min", async () => {
      const { activeTransfers, initiatorIdentifier, params, previousState } = createValidSetupContext();
      params.details.timeout = "1";
      await callAndVerifyError(
        initiator,
        params,
        previousState,
        activeTransfers,
        initiatorIdentifier,
        ValidationError.reasons.ShortChannelTimeout,
      );
    });
    it("should fail if timeout is above max", async () => {
      const { activeTransfers, initiatorIdentifier, params, previousState } = createValidSetupContext();
      params.details.timeout = "10000000000000000000";
      await callAndVerifyError(
        initiator,
        params,
        previousState,
        activeTransfers,
        initiatorIdentifier,
        ValidationError.reasons.LongChannelTimeout,
      );
    });
    it("should fail if counterparty === initiator", async () => {
      const { activeTransfers, initiatorIdentifier, params, previousState } = createValidSetupContext();
      params.details.counterpartyIdentifier = initiatorIdentifier;
      await callAndVerifyError(
        initiator,
        params,
        previousState,
        activeTransfers,
        initiatorIdentifier,
        ValidationError.reasons.InvalidCounterparty,
      );
    });
  });

  describe("deposit params", () => {
    it("should work for initiator", async () => {
      const { previousState, activeTransfers, initiatorIdentifier, params } = createValidDepositContext();
      const result = await validation.validateUpdateParams(
        initiator,
        chainReader,
        params,
        previousState,
        activeTransfers,
        initiatorIdentifier,
      );
      expect(result.getError()).to.be.undefined;
    });

    it("should work for responder", async () => {
      const { previousState, activeTransfers, initiatorIdentifier, params } = createValidDepositContext();
      const result = await validation.validateUpdateParams(
        responder,
        chainReader,
        params,
        previousState,
        activeTransfers,
        initiatorIdentifier,
      );
      expect(result.getError()).to.be.undefined;
    });

    it("should fail if it is an invalid assetId", async () => {
      const { previousState, activeTransfers, initiatorIdentifier, params } = createValidDepositContext();
      params.details.assetId = "fail";
      await callAndVerifyError(
        initiator,
        params,
        previousState,
        activeTransfers,
        initiatorIdentifier,
        ValidationError.reasons.InvalidAssetId,
      );
    });
  });

  describe("create params", () => {
    it("should work for initiator", async () => {
      const { previousState, activeTransfers, initiatorIdentifier, params } = createValidCreateContext();
      const result = await validation.validateUpdateParams(
        initiator,
        chainReader,
        params,
        previousState,
        activeTransfers,
        initiatorIdentifier,
      );
      expect(result.getError()).to.be.undefined;
      expect(chainReader.create.callCount).to.be.eq(1);
    });

    it("should work for responder", async () => {
      const { previousState, activeTransfers, initiatorIdentifier, params } = createValidCreateContext();
      const result = await validation.validateUpdateParams(
        responder,
        chainReader,
        params,
        previousState,
        activeTransfers,
        initiatorIdentifier,
      );
      expect(result.getError()).to.be.undefined;
      expect(chainReader.create.callCount).to.be.eq(1);
    });

    it("should fail if assetId is not in channel", async () => {
      const { previousState, activeTransfers, initiatorIdentifier, params } = createValidCreateContext();
      params.details.assetId = mkAddress("0xddddd555555");
      await callAndVerifyError(
        initiator,
        params,
        previousState,
        activeTransfers,
        initiatorIdentifier,
        ValidationError.reasons.AssetNotFound,
      );
    });

    it("should fail if transfer with that id is already active", async () => {
      const { previousState, activeTransfers, initiatorIdentifier, params, transfer } = createValidCreateContext();
      await callAndVerifyError(
        initiator,
        params,
        previousState,
        [...activeTransfers, transfer],
        initiatorIdentifier,
        ValidationError.reasons.DuplicateTransferId,
      );
    });

    it("should fail if initiator calling, initiator out of funds", async () => {
      const { previousState, activeTransfers, params } = createValidCreateContext();
      previousState.balances[0] = { to: [initiator.address, responder.address], amount: ["5", "3"] };
      params.details.assetId = previousState.assetIds[0];
      params.details.balance = { to: [initiator.address, responder.address], amount: ["7", "1"] };
      await callAndVerifyError(
        initiator,
        params,
        previousState,
        activeTransfers,
        initiator.publicIdentifier,
        ValidationError.reasons.InsufficientFunds,
      );
    });

    it("should fail if initiator calling, responder out of funds", async () => {
      const { previousState, activeTransfers, params } = createValidCreateContext();
      previousState.balances[0] = { to: [initiator.address, responder.address], amount: ["15", "3"] };
      params.details.assetId = previousState.assetIds[0];
      params.details.balance = { to: [initiator.address, responder.address], amount: ["7", "7"] };
      await callAndVerifyError(
        initiator,
        params,
        previousState,
        activeTransfers,
        initiator.publicIdentifier,
        ValidationError.reasons.InsufficientFunds,
      );
    });

    it("should fail if responder calling, initiator out of funds", async () => {
      const { previousState, activeTransfers, params } = createValidCreateContext();
      previousState.balances[0] = { to: [initiator.address, responder.address], amount: ["5", "3"] };
      params.details.assetId = previousState.assetIds[0];
      params.details.balance = { to: [initiator.address, responder.address], amount: ["7", "2"] };
      await callAndVerifyError(
        responder,
        params,
        previousState,
        activeTransfers,
        initiator.publicIdentifier,
        ValidationError.reasons.InsufficientFunds,
      );
    });

    it("should fail if responder calling, responder out of funds", async () => {
      const { previousState, activeTransfers, params } = createValidCreateContext();
      previousState.balances[0] = { to: [initiator.address, responder.address], amount: ["15", "3"] };
      params.details.assetId = previousState.assetIds[0];
      params.details.balance = { to: [initiator.address, responder.address], amount: ["7", "12"] };
      await callAndVerifyError(
        responder,
        params,
        previousState,
        activeTransfers,
        initiator.publicIdentifier,
        ValidationError.reasons.InsufficientFunds,
      );
    });

    it("should fail if timeout is below min", async () => {
      const { previousState, activeTransfers, initiatorIdentifier, params } = createValidCreateContext();
      params.details.timeout = "1";
      await callAndVerifyError(
        initiator,
        params,
        previousState,
        activeTransfers,
        initiatorIdentifier,
        ValidationError.reasons.TransferTimeoutBelowMin,
      );
    });

    it("should fail if timeout is above max", async () => {
      const { previousState, activeTransfers, initiatorIdentifier, params } = createValidCreateContext();
      previousState.timeout = MAXIMUM_CHANNEL_TIMEOUT.toString();
      params.details.timeout = (MAXIMUM_TRANSFER_TIMEOUT + 10).toString();
      await callAndVerifyError(
        initiator,
        params,
        previousState,
        activeTransfers,
        initiatorIdentifier,
        ValidationError.reasons.TransferTimeoutAboveMax,
      );
    });

    it("should fail if timeout equal to channel timeout", async () => {
      const { previousState, activeTransfers, initiatorIdentifier, params } = createValidCreateContext();
      params.details.timeout = previousState.timeout;
      await callAndVerifyError(
        initiator,
        params,
        previousState,
        activeTransfers,
        initiatorIdentifier,
        ValidationError.reasons.TransferTimeoutAboveChannel,
      );
    });

    it("should fail if timeout greater than channel timeout", async () => {
      const { previousState, activeTransfers, initiatorIdentifier, params } = createValidCreateContext();
      params.details.timeout = (parseInt(previousState.timeout) + 1).toString();
      await callAndVerifyError(
        initiator,
        params,
        previousState,
        activeTransfers,
        initiatorIdentifier,
        ValidationError.reasons.TransferTimeoutAboveChannel,
      );
    });

    it("should fail if chainReader.create fails", async () => {
      const { previousState, activeTransfers, initiatorIdentifier, params } = createValidCreateContext();
      const chainErr = new ChainError("fail");
      chainReader.create.resolves(Result.fail(chainErr));
      await callAndVerifyError(
        initiator,
        params,
        previousState,
        activeTransfers,
        initiatorIdentifier,
        ValidationError.reasons.ChainServiceFailure,
        { chainServiceMethod: "create", chainServiceError: VectorError.jsonify(chainErr) },
      );
    });

    it("should fail if chainReader.create returns false", async () => {
      const { previousState, activeTransfers, initiatorIdentifier, params } = createValidCreateContext();
      chainReader.create.resolves(Result.ok(false));
      await callAndVerifyError(
        initiator,
        params,
        previousState,
        activeTransfers,
        initiatorIdentifier,
        ValidationError.reasons.InvalidInitialState,
      );
    });
  });

  describe("resolve params", () => {
    it("should work for initiator", async () => {
      const { previousState, activeTransfers, initiatorIdentifier, params } = createValidResolveContext();
      const result = await validation.validateUpdateParams(
        initiator,
        chainReader,
        params,
        previousState,
        activeTransfers,
        initiatorIdentifier,
      );
      expect(result.getError()).to.be.undefined;
    });

    it("should work for responder", async () => {
      const { previousState, activeTransfers, initiatorIdentifier, params } = createValidResolveContext();
      const result = await validation.validateUpdateParams(
        responder,
        chainReader,
        params,
        previousState,
        activeTransfers,
        initiatorIdentifier,
      );
      expect(result.getError()).to.be.undefined;
    });

    it("should fail if transfer is not active", async () => {
      const { previousState, initiatorIdentifier, params } = createValidResolveContext();
      await callAndVerifyError(
        initiator,
        params,
        previousState,
        [],
        initiatorIdentifier,
        ValidationError.reasons.TransferNotActive,
      );
    });

    it("should fail if transferResolver is not an object", async () => {
      const { previousState, initiatorIdentifier, params, activeTransfers } = createValidResolveContext();
      params.details.transferResolver = "fail";
      await callAndVerifyError(
        initiator,
        params,
        previousState,
        activeTransfers,
        initiatorIdentifier,
        ValidationError.reasons.InvalidResolver,
      );
    });

    it("should fail if initiator is transfer responder", async () => {
      const { previousState, params, activeTransfers } = createValidResolveContext();
      await callAndVerifyError(
        initiator,
        params,
        previousState,
        activeTransfers,
        initiator.publicIdentifier,
        ValidationError.reasons.OnlyResponderCanInitiateResolve,
      );
    });

    it("should fail if the transfer has an associated resolver", async () => {
      const { previousState, initiatorIdentifier, params, transfer } = createValidResolveContext();
      transfer.transferResolver = { preImage: getRandomBytes32() };
      await callAndVerifyError(
        initiator,
        params,
        previousState,
        [transfer],
        initiatorIdentifier,
        ValidationError.reasons.TransferResolved,
      );
    });
  });
});

// TODO: validUpdateParamsStub is not working
describe.skip("validateParamsAndApplyUpdate", () => {
  // Test values
  const signer = getRandomChannelSigner();
  const params = createTestUpdateParams(UpdateType.create);
  const previousState = createTestChannelState(UpdateType.deposit).channel;
  const activeTransfers = [];

  // Declare all mocks
  let chainReader: Sinon.SinonStubbedInstance<VectorChainReader>;
  let externalValidationStub: {
    validateInbound: Sinon.SinonStub;
    validateOutbound: Sinon.SinonStub;
  };
  let validateUpdateParamsStub: Sinon.SinonStub;
  let generateAndApplyUpdateStub: Sinon.SinonStub;

  beforeEach(() => {
    // Set mocks
    chainReader = Sinon.createStubInstance(VectorChainReader);
    externalValidationStub = {
      validateInbound: Sinon.stub().resolves(Result.ok(undefined)),
      validateOutbound: Sinon.stub().resolves(Result.ok(undefined)),
    };

    validateUpdateParamsStub = Sinon.stub(validation, "validateUpdateParams");
    generateAndApplyUpdateStub = Sinon.stub(vectorUpdate, "generateAndApplyUpdate");
  });

  afterEach(() => {
    Sinon.restore();
  });

  it("should fail if validateUpdateParams fails", async () => {
    validateUpdateParamsStub.resolves(Result.fail(new Error("fail")));
    const result = await validation.validateParamsAndApplyUpdate(
      signer,
      chainReader,
      externalValidationStub,
      params,
      previousState,
      activeTransfers,
      signer.publicIdentifier,
    );
    expect(result.getError()?.message).to.be.eq(OutboundChannelUpdateError.reasons.OutboundValidationFailed);
    expect(result.getError()?.context.params).to.be.deep.eq(params);
    expect(result.getError()?.context.state).to.be.deep.eq(previousState);
    expect(result.getError()?.context.error).to.be.eq("fail");
    expect(result.isError).to.be.true;
  });

  it("should work", async () => {
    generateAndApplyUpdateStub.resolves(Result.ok("pass"));
    validateUpdateParamsStub.resolves(Result.ok(undefined));
    const result = await validation.validateParamsAndApplyUpdate(
      signer,
      chainReader,
      externalValidationStub,
      params,
      previousState,
      activeTransfers,
      signer.publicIdentifier,
    );
    expect(result.getError()).to.be.undefined;
    expect(result.isError).to.be.false;
    expect(result.getValue()).to.be.eq("pass");
  });
});

describe("validateAndApplyInboundUpdate", () => {
  // Test values
  let signers: ChannelSigner[];
  let previousState: FullChannelState;
  let update: ChannelUpdate;
  let activeTransfers: FullTransferState[];
  const aliceSignature = mkSig("0x11");
  const bobSignature = mkSig("0x22");

  // Declare all mocks
  let chainReader: Sinon.SinonStubbedInstance<VectorChainReader>;
  let validateParamsAndApplyUpdateStub: Sinon.SinonStub;
  let validateChannelUpdateSignaturesStub: Sinon.SinonStub;
  let generateSignedChannelCommitmentStub: Sinon.SinonStub;
  let applyUpdateStub: Sinon.SinonStub;
  let externalValidationStub: {
    validateInbound: Sinon.SinonStub;
    validateOutbound: Sinon.SinonStub;
  };

  // Create helper to run test
  const runErrorTest = async (
    errorMessage: Values<typeof InboundChannelUpdateError.reasons>,
    signer: ChannelSigner = signers[0],
    context: any = {},
  ) => {
    const result = await validation.validateAndApplyInboundUpdate(
      chainReader,
      externalValidationStub,
      signer,
      update,
      previousState,
      activeTransfers ?? [],
    );
    const error = result.getError();
    expect(error).to.be.ok;
    expect(result.isError).to.be.true;
    expect(error?.message).to.be.eq(errorMessage);
    expect(error?.context.state).to.be.deep.eq(previousState);
    expect(error?.context ?? {}).to.containSubset(context);
    return;
  };

  // Create helper to generate successful env for mocks
  // (can be overridden in individual tests)
  const prepEnv = () => {
    const updatedChannel = createTestChannelState(UpdateType.setup).channel;
    const updatedActiveTransfers = undefined;
    const updatedTransfer = undefined;

    // Need for double signed and single signed
    validateChannelUpdateSignaturesStub.resolves(Result.ok(undefined));

    // Needed for double signed
    chainReader.resolve.resolves(Result.ok({ to: [updatedChannel.alice, updatedChannel.bob], amount: ["10", "2"] }));
    applyUpdateStub.returns(
      Result.ok({
        updatedActiveTransfers,
        updatedTransfer,
        updatedChannel,
      }),
    );

    // Needed for single signed
    externalValidationStub.validateInbound.resolves(Result.ok(undefined));

    validateParamsAndApplyUpdateStub.resolves(Result.ok({ updatedChannel, updatedActiveTransfers, updatedTransfer }));

    generateSignedChannelCommitmentStub.resolves(Result.ok({ aliceSignature, bobSignature }));
    return { aliceSignature, bobSignature, updatedChannel, updatedTransfer, updatedActiveTransfers };
  };

  beforeEach(() => {
    // Set test values
    signers = Array(2)
      .fill(0)
      .map((_) => getRandomChannelSigner());

    // Set mocks
    chainReader = Sinon.createStubInstance(VectorChainReader);
    validateParamsAndApplyUpdateStub = Sinon.stub(validation, "validateParamsAndApplyUpdate");
    validateChannelUpdateSignaturesStub = Sinon.stub(vectorUtils, "validateChannelSignatures").resolves(
      Result.ok(undefined),
    );
    generateSignedChannelCommitmentStub = Sinon.stub(vectorUtils, "generateSignedChannelCommitment");
    applyUpdateStub = Sinon.stub(vectorUpdate, "applyUpdate");
    externalValidationStub = {
      validateInbound: Sinon.stub().resolves(Result.ok(undefined)),
      validateOutbound: Sinon.stub().resolves(Result.ok(undefined)),
    };
  });

  afterEach(() => {
    Sinon.restore();
  });

  describe("should properly validate update schema", () => {
    describe("should fail if update is malformed", () => {
      const valid = createTestChannelUpdate(UpdateType.setup);
      const tests = [
        {
          name: "no channelAddress",
          overrides: { channelAddress: undefined },
          error: "should have required property 'channelAddress'",
        },
        {
          name: "malformed channelAddress",
          overrides: { channelAddress: "fail" },
          error: 'should match pattern "^0x[a-fA-F0-9]{40}$"',
        },
        {
          name: "no fromIdentifier",
          overrides: { fromIdentifier: undefined },
          error: "should have required property 'fromIdentifier'",
        },
        {
          name: "malformed fromIdentifier",
          overrides: { fromIdentifier: "fail" },
          error: 'should match pattern "^vector([a-zA-Z0-9]{50})$"',
        },
        {
          name: "no toIdentifier",
          overrides: { toIdentifier: undefined },
          error: "should have required property 'toIdentifier'",
        },
        {
          name: "malformed toIdentifier",
          overrides: { toIdentifier: "fail" },
          error: 'should match pattern "^vector([a-zA-Z0-9]{50})$"',
        },
        {
          name: "no type",
          overrides: { type: undefined },
          error: "should have required property 'type'",
        },
        {
          name: "malformed type",
          overrides: { type: "fail" },
          error:
            "should be equal to one of the allowed values,should be equal to one of the allowed values,should be equal to one of the allowed values,should be equal to one of the allowed values,should match some schema in anyOf",
        },
        {
          name: "no nonce",
          overrides: { nonce: undefined },
          error: "should have required property 'nonce'",
        },
        {
          name: "malformed nonce",
          overrides: { nonce: "fail" },
          error: "should be number",
        },
        {
          name: "no balance",
          overrides: { balance: undefined },
          error: "should have required property 'balance'",
        },
        {
          name: "malformed balance",
          overrides: { balance: "fail" },
          error: "should be object",
        },
        {
          name: "no assetId",
          overrides: { assetId: undefined },
          error: "should have required property 'assetId'",
        },
        {
          name: "malformed assetId",
          overrides: { assetId: "fail" },
          error: 'should match pattern "^0x[a-fA-F0-9]{40}$"',
        },
        {
          name: "no details",
          overrides: { details: undefined },
          error: "should have required property 'details'",
        },
        {
          name: "malformed aliceSignature",
          overrides: { aliceSignature: "fail" },
          error: 'should match pattern "^0x([a-fA-F0-9]{130})$",should be null,should match some schema in anyOf',
        },
        {
          name: "malformed bobSignature",
          overrides: { bobSignature: "fail" },
          error: 'should match pattern "^0x([a-fA-F0-9]{130})$",should be null,should match some schema in anyOf',
        },
      ];
      for (const test of tests) {
        it(test.name, async () => {
          update = { ...valid, ...(test.overrides ?? {}) } as any;
          await runErrorTest(InboundChannelUpdateError.reasons.MalformedUpdate, signers[0], {
            updateError: test.error,
          });
        });
      }
    });

    describe("should fail if setup update details are malformed", () => {
      const valid = createTestChannelUpdate(UpdateType.setup);
      const tests = [
        {
          name: "no timeout",
          overrides: { timeout: undefined },
          error: "should have required property 'timeout'",
        },
        {
          name: "invalid timeout",
          overrides: { timeout: "fail" },
          error: 'should match pattern "^([0-9])*$"',
        },
        {
          name: "no networkContext",
          overrides: { networkContext: undefined },
          error: "should have required property 'networkContext'",
        },
        {
          name: "no networkContext.chainId",
          overrides: { networkContext: { ...valid.details.networkContext, chainId: undefined } },
          error: "should have required property 'chainId'",
        },
        {
          name: "invalid networkContext.chainId",
          overrides: { networkContext: { ...valid.details.networkContext, chainId: "fail" } },
          error: "should be number",
        },
        {
          name: "no networkContext.providerUrl",
          overrides: { networkContext: { ...valid.details.networkContext, providerUrl: undefined } },
          error: "should have required property 'providerUrl'",
        },
        {
          name: "invalid networkContext.providerUrl",
          overrides: { networkContext: { ...valid.details.networkContext, providerUrl: "fail" } },
          error: 'should match format "uri"',
        },
        {
          name: "no networkContext.channelFactoryAddress",
          overrides: { networkContext: { ...valid.details.networkContext, channelFactoryAddress: undefined } },
          error: "should have required property 'channelFactoryAddress'",
        },
        {
          name: "invalid networkContext.channelFactoryAddress",
          overrides: { networkContext: { ...valid.details.networkContext, channelFactoryAddress: "fail" } },
          error: 'should match pattern "^0x[a-fA-F0-9]{40}$"',
        },
        {
          name: "no networkContext.transferRegistryAddress",
          overrides: { networkContext: { ...valid.details.networkContext, transferRegistryAddress: undefined } },
          error: "should have required property 'transferRegistryAddress'",
        },
        {
          name: "invalid networkContext.transferRegistryAddress",
          overrides: { networkContext: { ...valid.details.networkContext, transferRegistryAddress: "fail" } },
          error: 'should match pattern "^0x[a-fA-F0-9]{40}$"',
        },
      ];
      for (const test of tests) {
        it(test.name, async () => {
          update = {
            ...valid,
            details: {
              ...valid.details,
              ...test.overrides,
            },
          };
          await runErrorTest(InboundChannelUpdateError.reasons.MalformedDetails, signers[0], {
            detailsError: test.error,
          });
        });
      }
    });

    describe("should fail if deposit update details are malformed", () => {
      const valid = createTestChannelUpdate(UpdateType.deposit);
      const tests = [
        {
          name: "no totalDepositsAlice",
          overrides: { totalDepositsAlice: undefined },
          error: "should have required property 'totalDepositsAlice'",
        },
        {
          name: "malformed totalDepositsAlice",
          overrides: { totalDepositsAlice: "fail" },
          error: 'should match pattern "^([0-9])*$"',
        },
        {
          name: "no totalDepositsBob",
          overrides: { totalDepositsBob: undefined },
          error: "should have required property 'totalDepositsBob'",
        },
        {
          name: "malformed totalDepositsBob",
          overrides: { totalDepositsBob: "fail" },
          error: 'should match pattern "^([0-9])*$"',
        },
      ];
      for (const test of tests) {
        it(test.name, async () => {
          update = {
            ...valid,
            details: {
              ...valid.details,
              ...test.overrides,
            },
          };
          await runErrorTest(InboundChannelUpdateError.reasons.MalformedDetails, signers[0], {
            detailsError: test.error,
          });
        });
      }
    });

    describe("should fail if create update details are malformed", () => {
      const valid = createTestChannelUpdate(UpdateType.create);
      const tests = [
        {
          name: "no transferId",
          overrides: { transferId: undefined },
          error: "should have required property 'transferId'",
        },
        {
          name: "malformed transferId",
          overrides: { transferId: "fail" },
          error: 'should match pattern "^0x([a-fA-F0-9]{64})$"',
        },
        {
          name: "no balance",
          overrides: { balance: undefined },
          error: "should have required property 'balance'",
        },
        {
          name: "malformed balance",
          overrides: { balance: "fail" },
          error: "should be object",
        },
        {
          name: "no transferDefinition",
          overrides: { transferDefinition: undefined },
          error: "should have required property 'transferDefinition'",
        },
        {
          name: "malformed transferDefinition",
          overrides: { transferDefinition: "fail" },
          error: 'should match pattern "^0x[a-fA-F0-9]{40}$"',
        },
        {
          name: "no transferTimeout",
          overrides: { transferTimeout: undefined },
          error: "should have required property 'transferTimeout'",
        },
        {
          name: "malformed transferTimeout",
          overrides: { transferTimeout: "fail" },
          error: 'should match pattern "^([0-9])*$"',
        },
        {
          name: "no transferInitialState",
          overrides: { transferInitialState: undefined },
          error: "should have required property 'transferInitialState'",
        },
        {
          name: "malformed transferInitialState",
          overrides: { transferInitialState: "fail" },
          error: "should be object",
        },
        {
          name: "no transferEncodings",
          overrides: { transferEncodings: undefined },
          error: "should have required property 'transferEncodings'",
        },
        {
          name: "malformed transferEncodings",
          overrides: { transferEncodings: "fail" },
          error: "should be array",
        },
        {
          name: "no merkleProofData",
          overrides: { merkleProofData: undefined },
          error: "should have required property 'merkleProofData'",
        },
        {
          name: "malformed merkleProofData",
          overrides: { merkleProofData: "fail" },
          error: "should be array",
        },
        {
          name: "no merkleRoot",
          overrides: { merkleRoot: undefined },
          error: "should have required property 'merkleRoot'",
        },
        {
          name: "malformed merkleRoot",
          overrides: { merkleRoot: "fail" },
          error: 'should match pattern "^0x([a-fA-F0-9]{64})$"',
        },
        {
          name: "malformed meta",
          overrides: { meta: "fail" },
          error: "should be object",
        },
      ];
      for (const test of tests) {
        it(test.name, async () => {
          update = {
            ...valid,
            details: {
              ...valid.details,
              ...test.overrides,
            },
          };
          await runErrorTest(InboundChannelUpdateError.reasons.MalformedDetails, signers[0], {
            detailsError: test.error,
          });
        });
      }
    });

    describe("should fail if resolve update details are malformed", () => {
      const valid = createTestChannelUpdate(UpdateType.resolve);
      const tests = [
        {
          name: "no transferId",
          overrides: { transferId: undefined },
          error: "should have required property 'transferId'",
        },
        {
          name: "malformed transferId",
          overrides: { transferId: "fail" },
          error: 'should match pattern "^0x([a-fA-F0-9]{64})$"',
        },
        {
          name: "no transferDefinition",
          overrides: { transferDefinition: undefined },
          error: "should have required property 'transferDefinition'",
        },
        {
          name: "malformed transferDefinition",
          overrides: { transferDefinition: "fail" },
          error: 'should match pattern "^0x[a-fA-F0-9]{40}$"',
        },
        {
          name: "no transferResolver",
          overrides: { transferResolver: undefined },
          error: "should have required property '.transferResolver'",
        },
        // {
        //   name: "malformed transferResolver",
        //   overrides: { transferResolver: "fail" },
        //   error: "should be object",
        // },
        {
          name: "no merkleRoot",
          overrides: { merkleRoot: undefined },
          error: "should have required property 'merkleRoot'",
        },
        {
          name: "malformed merkleRoot",
          overrides: { merkleRoot: "fail" },
          error: 'should match pattern "^0x([a-fA-F0-9]{64})$"',
        },
        {
          name: "malformed meta",
          overrides: { meta: "fail" },
          error: "should be object",
        },
      ];
      for (const test of tests) {
        it(test.name, async () => {
          update = {
            ...valid,
            details: {
              ...valid.details,
              ...test.overrides,
            },
          };
          await runErrorTest(InboundChannelUpdateError.reasons.MalformedDetails, signers[0], {
            detailsError: test.error,
          });
        });
      }
    });
  });

  describe("should handle double signed update", () => {
    const updateNonce = 3;

    beforeEach(() => {
      previousState = createTestChannelState(UpdateType.deposit, { nonce: 2 }).channel;
    });

    it("should work without hitting validation for UpdateType.resolve", async () => {
      const { updatedActiveTransfers, updatedChannel, updatedTransfer } = prepEnv();
      update = createTestChannelUpdate(UpdateType.resolve, {
        aliceSignature: mkSig("0xaaa"),
        bobSignature: mkSig("0xbbb"),
        nonce: updateNonce,
      });

      // Run test
      const result = await validation.validateAndApplyInboundUpdate(
        chainReader,
        externalValidationStub,
        signers[0],
        update,
        previousState,
        [createTestFullHashlockTransferState({ transferId: update.details.transferId })],
      );
      expect(result.isError).to.be.false;
      const returned = result.getValue();
      expect(returned).to.containSubset({
        updatedChannel: {
          ...updatedChannel,
          latestUpdate: {
            ...updatedChannel.latestUpdate,
            aliceSignature: update.aliceSignature,
            bobSignature: update.bobSignature,
          },
        },
        updatedActiveTransfers,
        updatedTransfer,
      });

      // Verify call stack
      expect(applyUpdateStub.callCount).to.be.eq(1);
      expect(chainReader.resolve.callCount).to.be.eq(1);
      expect(validateChannelUpdateSignaturesStub.callCount).to.be.eq(1);
      expect(validateParamsAndApplyUpdateStub.callCount).to.be.eq(0);
      expect(generateSignedChannelCommitmentStub.callCount).to.be.eq(0);
      expect(externalValidationStub.validateInbound.callCount).to.be.eq(0);
    });

    it("should work without hitting validation for all other update types", async () => {
      const { updatedActiveTransfers, updatedChannel, updatedTransfer } = prepEnv();
      update = createTestChannelUpdate(UpdateType.create, {
        aliceSignature: mkSig("0xaaa"),
        bobSignature: mkSig("0xbbb"),
        nonce: updateNonce,
      });

      // Run test
      const result = await validation.validateAndApplyInboundUpdate(
        chainReader,
        externalValidationStub,
        signers[0],
        update,
        previousState,
        [],
      );
      expect(result.isError).to.be.false;
      const returned = result.getValue();
      expect(returned).to.containSubset({
        updatedChannel: {
          ...updatedChannel,
          latestUpdate: {
            ...updatedChannel.latestUpdate,
            aliceSignature: update.aliceSignature,
            bobSignature: update.bobSignature,
          },
        },
        updatedActiveTransfers,
        updatedTransfer,
      });

      // Verify call stack
      expect(applyUpdateStub.callCount).to.be.eq(1);
      expect(validateChannelUpdateSignaturesStub.callCount).to.be.eq(1);
      expect(chainReader.resolve.callCount).to.be.eq(0);
      expect(validateParamsAndApplyUpdateStub.callCount).to.be.eq(0);
      expect(generateSignedChannelCommitmentStub.callCount).to.be.eq(0);
      expect(externalValidationStub.validateInbound.callCount).to.be.eq(0);
    });

    it("should fail if chainReader.resolve fails", async () => {
      prepEnv();

      // Set failing stub
      const chainErr = new ChainError("fail");
      chainReader.resolve.resolves(Result.fail(chainErr));

      // Create update
      update = createTestChannelUpdate(UpdateType.resolve, { aliceSignature, bobSignature, nonce: updateNonce });
      activeTransfers = [createTestFullHashlockTransferState({ transferId: update.details.transferId })];
      await runErrorTest(InboundChannelUpdateError.reasons.CouldNotGetFinalBalance, undefined, {
        chainServiceError: VectorError.jsonify(chainErr),
      });
    });

    it("should fail if transfer is inactive", async () => {
      prepEnv();

      // Create update
      update = createTestChannelUpdate(UpdateType.resolve, { aliceSignature, bobSignature, nonce: updateNonce });
      activeTransfers = [];
      await runErrorTest(InboundChannelUpdateError.reasons.TransferNotActive, signers[0], { existing: [] });
    });

    it("should fail if applyUpdate fails", async () => {
      prepEnv();

      // Set failing stub
      const err = new ChainError("fail");
      applyUpdateStub.returns(Result.fail(err));

      // Create update
      update = createTestChannelUpdate(UpdateType.setup, { aliceSignature, bobSignature, nonce: updateNonce });
      activeTransfers = [];
      await runErrorTest(InboundChannelUpdateError.reasons.ApplyUpdateFailed, signers[0], {
        applyUpdateError: err.message,
        applyUpdateContext: err.context,
      });
    });

    it("should fail if validateChannelUpdateSignatures fails", async () => {
      prepEnv();

      // Set failing stub
      validateChannelUpdateSignaturesStub.resolves(Result.fail(new Error("fail")));

      // Create update
      update = createTestChannelUpdate(UpdateType.setup, { aliceSignature, bobSignature, nonce: updateNonce });
      activeTransfers = [];
      await runErrorTest(InboundChannelUpdateError.reasons.BadSignatures, signers[0], {
        validateSignatureError: "fail",
      });
    });
  });

  it("should fail if update.nonce is not exactly one greater than previous", async () => {
    // Set a passing mocked env
    prepEnv();
    update = createTestChannelUpdate(UpdateType.setup, { nonce: 2 });
    await runErrorTest(InboundChannelUpdateError.reasons.InvalidUpdateNonce, signers[0]);
  });

  it("should fail if externalValidation.validateInbound fails", async () => {
    // Set a passing mocked env
    prepEnv();

    externalValidationStub.validateInbound.resolves(Result.fail(new Error("fail")));

    update = createTestChannelUpdate(UpdateType.setup, { nonce: 1, aliceSignature: undefined });
    await runErrorTest(InboundChannelUpdateError.reasons.ExternalValidationFailed, signers[0], {
      externalValidationError: "fail",
    });
  });

  it("should fail if validateParamsAndApplyUpdate fails", async () => {
    // Set a passing mocked env
    prepEnv();

    validateParamsAndApplyUpdateStub.resolves(Result.fail(new ChainError("fail")));

    update = createTestChannelUpdate(UpdateType.setup, { nonce: 1, aliceSignature: undefined });
    await runErrorTest(InboundChannelUpdateError.reasons.ApplyAndValidateInboundFailed, signers[0], {
      validationError: "fail",
      validationContext: {},
    });
  });

  it("should fail if single signed + invalid sig", async () => {
    // Set a passing mocked env
    prepEnv();

    validateChannelUpdateSignaturesStub.resolves(Result.fail(new Error("fail")));

    update = createTestChannelUpdate(UpdateType.setup, { nonce: 1, aliceSignature: undefined });
    await runErrorTest(InboundChannelUpdateError.reasons.BadSignatures, signers[0], { signatureError: "fail" });
  });

  it("should fail if generateSignedChannelCommitment fails", async () => {
    // Set a passing mocked env
    prepEnv();

    generateSignedChannelCommitmentStub.resolves(Result.fail(new Error("fail")));

    update = createTestChannelUpdate(UpdateType.setup, { nonce: 1, aliceSignature: undefined });
    await runErrorTest(InboundChannelUpdateError.reasons.GenerateSignatureFailed, signers[0], {
      signatureError: "fail",
    });
  });

  it("should work for a single signed update", async () => {
    // Set a passing mocked env
    const { updatedActiveTransfers, updatedChannel, updatedTransfer, aliceSignature, bobSignature } = prepEnv();

    update = createTestChannelUpdate(UpdateType.setup, { nonce: 1, aliceSignature: undefined });

    const result = await validation.validateAndApplyInboundUpdate(
      chainReader,
      externalValidationStub,
      signers[0],
      update,
      previousState,
      activeTransfers ?? [],
    );
    expect(result.isError).to.be.false;
    const returned = result.getValue();
    expect(returned).to.containSubset({
      updatedChannel: {
        ...updatedChannel,
        latestUpdate: { ...updatedChannel.latestUpdate, aliceSignature, bobSignature },
      },
      updatedActiveTransfers,
      updatedTransfer,
    });

    // Verify call stack
    expect(validateParamsAndApplyUpdateStub.callCount).to.be.eq(1);
    expect(validateChannelUpdateSignaturesStub.callCount).to.be.eq(1);
    expect(generateSignedChannelCommitmentStub.callCount).to.be.eq(1);
    expect(externalValidationStub.validateInbound.callCount).to.be.eq(1);
    expect(applyUpdateStub.callCount).to.be.eq(0);
    expect(chainReader.resolve.callCount).to.be.eq(0);
  });
});
