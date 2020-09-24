import {
  ChannelSigner,
  getRandomChannelSigner,
  createTestChannelUpdateWithSigners,
  createTestChannelStateWithSigners,
  getRandomBytes32,
  createTestUpdateParams,
  mkAddress,
  mkSig,
} from "@connext/vector-utils";
import {
  UpdateType,
  ChannelUpdate,
  InboundChannelUpdateError,
  OutboundChannelUpdateError,
  Result,
  UpdateParams,
} from "@connext/vector-types";
import { BigNumber, constants } from "ethers";
import { expect } from "chai";
import pino from "pino";
import Sinon from "sinon";
import { VectorOnchainService } from "@connext/vector-contracts";

// Import as full module for easy sinon function mocking
import * as vectorUpdate from "../update";
import * as vectorUtils from "../utils";
import * as vectorValidation from "../validate";
import { inbound, outbound } from "../sync";

import { MemoryStoreService } from "./services/store";
import { MemoryMessagingService } from "./services/messaging";
import { env } from "./utils";

describe("inbound", () => {
  // FIXME: These are blocking tests!
  it.skip("should fail if there is no channel in store and it is not a setup update", async () => {});
  it.skip("should fail if there is no transfer in the store and it is a resolve update", async () => {});
  it.skip("should fail if you are 3+ states behind the update", async () => {});
  it.skip("should fail if validating the update fails", async () => {});
  it.skip("should fail if applying the update fails", async () => {});
  it.skip("should fail if signing the data fails", async () => {});
  it.skip("should fail if saving the data fails", async () => {});
  it.skip("IFF update is invalid and channel is out of sync, should fail on retry, but sync properly", async () => {});
  describe.skip("should sync channel and retry update IFF state nonce is behind by 2 updates", async () => {
    describe.skip("initiator trying deposit", () => {
      it("missed setup, should work", async () => {});
      it("missed deposit, should work", async () => {});
      it("missed create, should work", async () => {});
      it("missed resolve, should work", async () => {});
    });

    describe.skip("initiator trying create", () => {
      it("missed deposit, should work", async () => {});
      it("missed create, should work", async () => {});
      it("missed resolve, should work", async () => {});
    });

    describe.skip("initiator trying resolve", () => {
      it("missed deposit, should work", async () => {});
      it("missed create, should work", async () => {});
      it("missed resolve, should work", async () => {});
    });
  });

  const chainProviders = env.chainProviders;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [chainIdStr, providerUrl] = Object.entries(chainProviders)[0] as string[];
  const inbox = getRandomBytes32();
  const logger = pino().child({
    testName: "inbound",
  });

  let signers: ChannelSigner[];
  let store: Sinon.SinonStubbedInstance<MemoryStoreService>;
  let messaging: Sinon.SinonStubbedInstance<MemoryMessagingService>;
  let chainService: Sinon.SinonStubbedInstance<VectorOnchainService>;

  let validationStub: Sinon.SinonStub;

  beforeEach(async () => {
    signers = Array(2)
      .fill(0)
      .map(() => getRandomChannelSigner(providerUrl));
    store = Sinon.createStubInstance(MemoryStoreService);
    messaging = Sinon.createStubInstance(MemoryMessagingService);
    chainService = Sinon.createStubInstance(VectorOnchainService);

    // Set the validation stub
    validationStub = Sinon.stub(vectorValidation, "validateAndApplyInboundUpdate");
  });

  afterEach(() => {
    Sinon.restore();
  });

  it("should work if there is no channel state stored and you are receiving a setup update", async () => {
    // Generate the update
    const update: ChannelUpdate<typeof UpdateType.setup> = createTestChannelUpdateWithSigners(
      signers,
      UpdateType.setup,
      {
        nonce: 1,
        signatures: [],
      },
    );
    // Set the validation stub
    validationStub.resolves(Result.ok({ commitment: {} as any, nextState: {} as any }));
    const result = await inbound(update, update, inbox, chainService, store, messaging, signers[1], logger);
    expect(result.getError()).to.be.undefined;

    // Make sure the calls were correctly performed
    expect(validationStub.callCount).to.be.eq(1);
    expect(messaging.respondToProtocolMessage.callCount).to.be.eq(1);
    expect(store.saveChannelState.callCount).to.be.eq(1);
  });

  it("should return an error if the update does not advance state", async () => {
    // Set the store mock
    store.getChannelState.resolves({ nonce: 1, latestUpdate: {} as any } as any);

    // Generate an update at nonce = 1
    const update = createTestChannelUpdateWithSigners(signers, UpdateType.setup, { nonce: 1 });

    const result = await inbound(update, {} as any, inbox, chainService, store, messaging, signers[1], logger);
    expect(result.isError).to.be.true;
    const error = result.getError()!;
    expect(error.message).to.be.eq(InboundChannelUpdateError.reasons.StaleUpdate);

    // Verify calls
    expect(messaging.respondWithProtocolError.callCount).to.be.eq(1);
    expect(store.saveChannelState.callCount).to.be.eq(0);
  });

  it("should work if stored state is behind (update nonce = stored nonce + 2)", async () => {
    // Set the store mock
    store.getChannelState.resolves({ nonce: 1, latestUpdate: {} as any } as any);

    // Set the validation mock
    validationStub
      .onFirstCall()
      .resolves(Result.ok({ commitment: {} as any, nextState: { nonce: 2, latestUpdate: {} as any } }));
    validationStub
      .onSecondCall()
      .resolves(Result.ok({ commitment: {} as any, nextState: { nonce: 3, latestUpdate: {} as any } }));

    // Create the update to sync
    const toSync = createTestChannelUpdateWithSigners(signers, UpdateType.deposit, { nonce: 2 });

    // Create the update to propose
    const update = createTestChannelUpdateWithSigners(signers, UpdateType.deposit, { nonce: 3 });

    const result = await inbound(update, toSync, inbox, chainService, store, messaging, signers[1], logger);
    expect(result.getError()).to.be.undefined;

    // Verify callstack
    expect(messaging.respondToProtocolMessage.callCount).to.be.eq(1);
    expect(messaging.respondWithProtocolError.callCount).to.be.eq(0);
    expect(store.saveChannelState.callCount).to.be.eq(2);
    expect(validationStub.callCount).to.be.eq(2);
    expect(validationStub.firstCall.args[0].nonce).to.be.eq(2);
    expect(validationStub.secondCall.args[0].nonce).to.be.eq(3);
  });

  it("should update if stored state is in sync", async () => {
    // Set the store mock
    store.getChannelState.resolves({ nonce: 1, latestUpdate: {} as any } as any);

    // Set the validation stub
    validationStub.resolves(Result.ok({ commitment: {} as any, nextState: { nonce: 3 } as any }));

    // Create the update to sync with (in this case, a deposit)
    const update = createTestChannelUpdateWithSigners(signers, UpdateType.deposit, {
      nonce: 2,
    });

    // Call `inbound`
    const result = await inbound(update, update, inbox, chainService, store, messaging, signers[1], logger);
    expect(result.getError()).to.be.undefined;

    // Verify callstack
    expect(messaging.respondToProtocolMessage.callCount).to.be.eq(1);
    expect(messaging.respondWithProtocolError.callCount).to.be.eq(0);
    expect(store.saveChannelState.callCount).to.be.eq(1);
    expect(validationStub.callCount).to.be.eq(1);
  });
});

describe("outbound", () => {
  // FIXME: These are blocking tests!
  it.skip("should fail if update to sync is single signed", async () => {});
  it.skip("should fail if the channel is not saved to store", async () => {});
  it.skip("IFF update is invalid and channel is out of sync, should fail on retry, but sync properly", async () => {});
  // .. see other skipped tests at bottom ..

  const chainProviders = env.chainProviders;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const providerUrl = Object.values(chainProviders)[0] as string;
  const logger = pino().child({
    testName: "inbound",
  });
  const channelAddress = mkAddress("0xccc");

  let signers: ChannelSigner[];
  let store: Sinon.SinonStubbedInstance<MemoryStoreService>;
  let messaging: Sinon.SinonStubbedInstance<MemoryMessagingService>;
  let chainService: Sinon.SinonStubbedInstance<VectorOnchainService>;

  let outboundValidationStub: Sinon.SinonStub;
  let inboundValidationStub: Sinon.SinonStub;
  let generationStub: Sinon.SinonStub;

  beforeEach(async () => {
    signers = Array(2)
      .fill(0)
      .map(() => getRandomChannelSigner(providerUrl));

    // Create all the services stubs
    store = Sinon.createStubInstance(MemoryStoreService);
    messaging = Sinon.createStubInstance(MemoryMessagingService);
    chainService = Sinon.createStubInstance(VectorOnchainService);

    // Set the validation + generation mock
    outboundValidationStub = Sinon.stub(vectorValidation, "validateOutbound");
    inboundValidationStub = Sinon.stub(vectorValidation, "validateAndApplyInboundUpdate");
    generationStub = Sinon.stub(vectorUpdate, "generateUpdate");

    // Stub out all signature validation
    Sinon.stub(vectorUtils, "validateChannelUpdateSignatures").resolves(undefined);
  });

  afterEach(() => {
    // Always restore stubs after tests
    Sinon.restore();
  });

  it("should fail if it fails to validate the update", async () => {
    const params = createTestUpdateParams(UpdateType.deposit, { channelAddress: "0xfail" });

    // Stub the validation function
    const error = new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.InvalidParams, params);
    outboundValidationStub.resolves(Result.fail(error));

    console.log("trying to call outbound...");
    const res = await outbound(params, store, chainService, messaging, signers[0], logger);
    console.log("res", res);
    expect(res.getError()).to.be.deep.eq(error);
  });

  it("should fail if it fails to generate the update", async () => {
    const params = createTestUpdateParams(UpdateType.deposit, { channelAddress: "0xfail" });

    // Stub the validation function
    outboundValidationStub.resolves(Result.ok({ validParams: {}, validState: {}, activeTransfers: [] }));

    // Stub the generate update function
    const error = new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.InvalidParams, params);
    generationStub.resolves(Result.fail(error));

    const res = await outbound(params, store, chainService, messaging, signers[0], logger);
    expect(res.isError).to.be.true;
    expect(res.getError()).to.be.deep.eq(error);
  });

  it("should fail if it counterparty update fails for some reason other than update being out of date", async () => {
    // Create a setup update
    const params = createTestUpdateParams(UpdateType.setup, {
      channelAddress,
      details: { counterpartyIdentifier: signers[1].publicIdentifier },
    });
    // Create a messaging service stub
    const counterpartyError = new InboundChannelUpdateError(InboundChannelUpdateError.reasons.RestoreNeeded, {} as any);
    messaging.sendProtocolMessage.resolves(Result.fail(counterpartyError));

    // Stub the validation + generation functions
    outboundValidationStub.resolves(Result.ok({ validParams: {}, validState: {}, activeTransfers: [] }));
    generationStub.resolves(Result.ok({ update: {}, channelState: {} }));

    // Call the outbound function
    const res = await outbound(params, store, chainService, messaging, signers[0], logger);

    // Verify the error is returned as an outbound error
    const error = res.getError();
    expect(error?.message).to.be.eq(OutboundChannelUpdateError.reasons.CounterpartyFailure);
    expect(error?.context).to.deep.eq({ counterpartyError: counterpartyError.message });

    // Verify message only sent once by initiator
    expect(messaging.sendProtocolMessage.callCount).to.be.eq(1);
  });

  it("should successfully initiate an update if channels are in sync", async () => {
    // Create the update (a user deposit on a setup channel)
    const assetId = constants.AddressZero;
    const depositBAmt = BigNumber.from(16);
    const params: UpdateParams<typeof UpdateType.deposit> = createTestUpdateParams(UpdateType.deposit, {
      channelAddress,
      details: { assetId },
    });

    // Create the channel and store mocks for the user
    // channel at nonce 1, proposes nonce 2, syncs nonce 2 from counterparty
    // then proposes nonce 3
    store.getChannelState.resolves(createTestChannelStateWithSigners(signers, UpdateType.setup, { nonce: 2 }));

    // Set the onchain service mocks
    chainService.getChannelOnchainBalance.resolves(Result.ok(depositBAmt));
    chainService.getLatestDepositByAssetId.resolves(Result.ok({ nonce: BigNumber.from(0), amount: BigNumber.from(0) }));

    // Stub the validation mocks
    outboundValidationStub.resolves(Result.ok({ validParams: {}, validState: { nonce: 2 }, activeTransfers: [] }));

    // Stub the generation results
    generationStub.onFirstCall().resolves(
      Result.ok({
        update: {},
        channelState: createTestChannelStateWithSigners(signers, UpdateType.deposit, { nonce: 3 }),
      }),
    );

    // Set the messaging mocks to return the proper update from the counterparty
    messaging.sendProtocolMessage // fails returning update to sync from
      .onFirstCall()
      .resolves(Result.ok({ update: {}, previousUpdate: {} } as any));

    // Call the outbound function
    const res = await outbound(params, store, chainService, messaging, signers[0], logger);

    // Verify return values
    expect(res.getError()).to.be.undefined;
    expect(res.getValue()).to.containSubset({ nonce: 3 });

    // Verify message only sent once by initiator w/update to sync
    expect(messaging.sendProtocolMessage.callCount).to.be.eq(1);
    // Verify sync happened
    expect(generationStub.callCount).to.be.eq(1);
    expect(outboundValidationStub.callCount).to.be.eq(1);
    expect(inboundValidationStub.callCount).to.be.eq(0);
    expect(store.saveChannelState.callCount).to.be.eq(1);
  });

  describe("should sync channel and retry update IFF update nonce === state nonce", async () => {
    describe.skip("initiator trying setup", () => {
      it("missed setup, should sync without retrying", async () => {});
    });

    describe("initiator trying deposit", () => {
      // Assume the initiator is Alice, and she is always trying to reconcile
      // a deposit. Generate test constants
      const assetId = constants.AddressZero;
      const userBBalance = BigNumber.from(9);
      const missedUpdateNonce = 2;
      const depositAAmt = BigNumber.from(14);
      const depositANonce = BigNumber.from(1);
      const params: UpdateParams<typeof UpdateType.deposit> = createTestUpdateParams(UpdateType.deposit, {
        channelAddress,
        details: { assetId },
      });

      beforeEach(() => {
        // Set the chain service mock
        chainService.getLatestDepositByAssetId.resolves(Result.ok({ nonce: depositANonce, amount: depositAAmt }));

        chainService.getChannelOnchainBalance.resolves(Result.ok(userBBalance.add(depositAAmt)));
      });

      afterEach(() => {
        // Always restore stubs after tests
        Sinon.restore();
      });

      it("missed deposit, should work", async () => {
        // Assume initiator missed a user deposit
        // Create the missed update
        const missedUpdate = createTestChannelUpdateWithSigners(signers, UpdateType.deposit, {
          nonce: missedUpdateNonce,
        });

        // Create the expected final double signed update state
        const signedUpdate = createTestChannelUpdateWithSigners(signers, UpdateType.deposit, {
          signatures: [mkSig("0xaaabbb"), mkSig("0xcccddd")],
          nonce: missedUpdateNonce + 1,
        });

        // Set messaging mocks:
        // - first call should return an error
        // - second call should return a final channel state
        const counterpartyError = new InboundChannelUpdateError(
          InboundChannelUpdateError.reasons.StaleUpdate,
          missedUpdate,
        );
        messaging.sendProtocolMessage.onCall(0).resolves(Result.fail(counterpartyError));
        messaging.sendProtocolMessage
          .onCall(1)
          .resolves(Result.ok({ update: signedUpdate, previousUpdate: missedUpdate }));

        // Stub the outbound validation mocks
        // - first call resolves final update at n - 1
        // - second call resolves final update at n
        outboundValidationStub.onCall(0).resolves(
          Result.ok({
            validState: { nonce: missedUpdateNonce - 1 },
            validParams: {},
          }),
        );
        outboundValidationStub.onCall(1).resolves(
          Result.ok({
            validState: { nonce: missedUpdateNonce },
            validParams: {},
          }),
        );

        // Stub out the inbound generation (where initiator syncs)
        inboundValidationStub.resolves(
          Result.ok({
            commitment: {},
            nextState: createTestChannelStateWithSigners(signers, UpdateType.deposit, {
              nonce: missedUpdateNonce,
              latestUpdate: missedUpdate,
            }),
          }),
        );

        // Stub the generation results
        generationStub.onCall(0).resolves(
          Result.ok({
            update: {},
            channelState: createTestChannelStateWithSigners(signers, UpdateType.deposit, { nonce: missedUpdateNonce }),
          }),
        );
        generationStub.onCall(1).resolves(
          Result.ok({
            update: {},
            channelState: createTestChannelStateWithSigners(signers, UpdateType.deposit, {
              nonce: missedUpdateNonce + 1,
            }),
          }),
        );

        // Generate the initiators stale channel, and set store mock
        const staleChannel = createTestChannelStateWithSigners(signers, UpdateType.setup, {
          nonce: missedUpdateNonce - 1,
        });
        store.getChannelState.resolves(staleChannel);

        // Call the outbound function
        const res = await outbound(params, store, chainService, messaging, signers[0], logger);

        // Verify the update was successfully sent + retried
        expect(res.getError()).to.be.undefined;
        expect(res.getValue()).to.be.containSubset({
          nonce: signedUpdate.nonce,
          latestUpdate: signedUpdate,
          channelAddress,
        });
        expect(messaging.sendProtocolMessage.callCount).to.be.eq(2);
        expect(store.saveChannelState.callCount).to.be.eq(2);
        expect(inboundValidationStub.callCount).to.be.eq(1);
      });

      it.skip("missed create, should work", async () => {});
      it.skip("missed resolve, should work", async () => {});
    });

    describe.skip("initiator trying create", () => {
      it("missed deposit, should work", async () => {});
      it("missed create, should work", async () => {});
      it("missed resolve, should work", async () => {});
    });

    describe.skip("initiator trying resolve", () => {
      it("missed deposit, should work", async () => {});
      it("missed create, should work", async () => {});
      it("missed resolve, should work", async () => {});
    });
  });
});
