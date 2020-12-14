/* eslint-disable @typescript-eslint/no-empty-function */
import {
  ChannelSigner,
  getRandomChannelSigner,
  createTestChannelUpdateWithSigners,
  createTestChannelStateWithSigners,
  createTestFullHashlockTransferState,
  getRandomBytes32,
  createTestUpdateParams,
  mkAddress,
  mkSig,
  expect,
  MemoryStoreService,
  MemoryMessagingService,
  getTestLoggers,
  createTestChannelUpdate,
} from "@connext/vector-utils";
import {
  UpdateType,
  ChannelUpdate,
  InboundChannelUpdateError,
  OutboundChannelUpdateError,
  Result,
  UpdateParams,
  FullChannelState,
  FullTransferState,
} from "@connext/vector-types";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import pino from "pino";
import Sinon from "sinon";
import { VectorChainReader } from "@connext/vector-contracts";

// Import as full module for easy sinon function mocking
import * as vectorUtils from "../utils";
import * as vectorValidation from "../validate";
import { inbound, outbound } from "../sync";

import { env } from "./env";

describe("inbound", () => {
  const chainProviders = env.chainProviders;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [chainIdStr, providerUrl] = Object.entries(chainProviders)[0] as string[];
  const inbox = getRandomBytes32();
  const logger = pino().child({
    testName: "inbound",
  });
  const externalValidation = {
    validateOutbound: (params: UpdateParams<any>, state: FullChannelState, activeTransfers: FullTransferState[]) =>
      Promise.resolve(Result.ok(undefined)),
    validateInbound: (update: ChannelUpdate<any>, state: FullChannelState, activeTransfers: FullTransferState[]) =>
      Promise.resolve(Result.ok(undefined)),
  };

  let signers: ChannelSigner[];
  let store: Sinon.SinonStubbedInstance<MemoryStoreService>;
  let messaging: Sinon.SinonStubbedInstance<MemoryMessagingService>;
  let chainService: Sinon.SinonStubbedInstance<VectorChainReader>;

  let validationStub: Sinon.SinonStub;

  beforeEach(async () => {
    signers = Array(2)
      .fill(0)
      .map(() => getRandomChannelSigner(providerUrl));
    store = Sinon.createStubInstance(MemoryStoreService);
    messaging = Sinon.createStubInstance(MemoryMessagingService);
    chainService = Sinon.createStubInstance(VectorChainReader);

    // Set the validation stub
    validationStub = Sinon.stub(vectorValidation, "validateAndApplyInboundUpdate");
  });

  afterEach(() => {
    Sinon.restore();
  });

  it("should return an error if the update does not advance state", async () => {
    // Set the store mock
    store.getChannelState.resolves({ nonce: 1, latestUpdate: {} as any } as any);

    // Generate an update at nonce = 1
    const update = createTestChannelUpdateWithSigners(signers, UpdateType.setup, { nonce: 1 });

    const result = await inbound(
      update,
      {} as any,
      inbox,
      chainService,
      store,
      messaging,
      externalValidation,
      signers[1],
      logger,
    );
    expect(result.isError).to.be.true;
    const error = result.getError()!;
    expect(error.message).to.be.eq(InboundChannelUpdateError.reasons.StaleUpdate);

    // Verify calls
    expect(messaging.respondWithProtocolError.callCount).to.be.eq(1);
    expect(store.saveChannelState.callCount).to.be.eq(0);
  });

  it("should fail if you are 3+ states behind the update", async () => {
    // Generate the update
    const prevUpdate: ChannelUpdate<typeof UpdateType.setup> = createTestChannelUpdateWithSigners(
      signers,
      UpdateType.setup,
      {
        nonce: 1,
      },
    );

    const update: ChannelUpdate<typeof UpdateType.setup> = createTestChannelUpdateWithSigners(
      signers,
      UpdateType.setup,
      {
        nonce: 5,
      },
    );

    const result = await inbound(
      update,
      prevUpdate,
      inbox,
      chainService,
      store,
      messaging,
      externalValidation,
      signers[1],
      logger,
    );

    expect(result.isError).to.be.true;
    const error = result.getError()!;
    expect(error.message).to.be.eq(InboundChannelUpdateError.reasons.StaleChannel);
    // Make sure the calls were correctly performed
    expect(validationStub.callCount).to.be.eq(0);
    expect(store.saveChannelState.callCount).to.be.eq(0);
    expect(messaging.respondToProtocolMessage.callCount).to.be.eq(0);
  });

  it("should fail if validating the update fails", async () => {
    // Generate the update
    const update: ChannelUpdate<typeof UpdateType.deposit> = createTestChannelUpdateWithSigners(
      signers,
      UpdateType.deposit,
      {
        nonce: 1,
      },
    );
    // Set the validation stub
    validationStub.resolves(
      Result.fail(
        new InboundChannelUpdateError(InboundChannelUpdateError.reasons.InboundValidationFailed, update, {} as any),
      ),
    );

    const result = await inbound(
      update,
      update,
      inbox,
      chainService,
      store,
      messaging,
      externalValidation,
      signers[1],
      logger,
    );

    expect(result.isError).to.be.true;
    const error = result.getError()!;
    expect(error.message).to.be.eq(InboundChannelUpdateError.reasons.InboundValidationFailed);
    // Make sure the calls were correctly performed
    expect(validationStub.callCount).to.be.eq(1);
    expect(store.saveChannelState.callCount).to.be.eq(0);
    expect(messaging.respondToProtocolMessage.callCount).to.be.eq(0);
  });

  it("should fail if saving the data fails", async () => {
    // Generate the update
    store.saveChannelState.rejects();

    const update: ChannelUpdate<typeof UpdateType.setup> = createTestChannelUpdateWithSigners(
      signers,
      UpdateType.setup,
      {
        nonce: 1,
      },
    );
    // Set the validation stub
    validationStub.resolves(Result.ok({ updatedChannel: {} as any }));
    const result = await inbound(
      update,
      update,
      inbox,
      chainService,
      store,
      messaging,
      externalValidation,
      signers[1],
      logger,
    );

    expect(result.isError).to.be.true;
    const error = result.getError()!;
    expect(error.message).to.be.eq(InboundChannelUpdateError.reasons.SaveChannelFailed);
    // Make sure the calls were correctly performed
    expect(validationStub.callCount).to.be.eq(1);
    expect(store.saveChannelState.callCount).to.be.eq(1);
    expect(messaging.respondToProtocolMessage.callCount).to.be.eq(0);
  });

  it("should update if stored state is in sync", async () => {
    // Set the store mock
    store.getChannelState.resolves({ nonce: 1, latestUpdate: {} as any } as any);

    // Set the validation stub
    validationStub.resolves(Result.ok({ updatedChannel: { nonce: 3 } as any }));

    // Create the update to sync with (in this case, a deposit)
    const update = createTestChannelUpdateWithSigners(signers, UpdateType.deposit, {
      nonce: 2,
    });

    // Call `inbound`
    const result = await inbound(
      update,
      update,
      inbox,
      chainService,
      store,
      messaging,
      externalValidation,
      signers[1],
      logger,
    );
    expect(result.getError()).to.be.undefined;

    // Verify callstack
    expect(messaging.respondToProtocolMessage.callCount).to.be.eq(1);
    expect(messaging.respondWithProtocolError.callCount).to.be.eq(0);
    expect(store.saveChannelState.callCount).to.be.eq(1);
    expect(validationStub.callCount).to.be.eq(1);
  });

  describe("IFF the update.nonce is ahead by 2, then the update recipient should try to sync", () => {
    it("should fail if there is no missed update", async () => {
      // Set the store mock
      store.getChannelState.resolves({ nonce: 1 } as any);

      // Create the received update
      const update = createTestChannelUpdateWithSigners(signers, UpdateType.deposit, { nonce: 3 });

      // Create the update to sync
      const result = await inbound(
        update,
        undefined as any,
        inbox,
        chainService,
        store,
        messaging,
        externalValidation,
        signers[1],
        logger,
      );
      expect(result.getError()?.message).to.be.eq(InboundChannelUpdateError.reasons.StaleChannel);

      // Verify nothing was saved and error properly sent
      expect(store.saveChannelState.callCount).to.be.eq(0);
      expect(messaging.respondToProtocolMessage.callCount).to.be.eq(0);
      expect(messaging.respondWithProtocolError.callCount).to.be.eq(1);
    });

    it("should fail if the missed update is not double signed", async () => {
      // Set the store mock
      store.getChannelState.resolves({ nonce: 1 } as any);

      // Create the received update
      const update = createTestChannelUpdateWithSigners(signers, UpdateType.deposit, { nonce: 3 });

      // Create previous update
      const toSync = createTestChannelUpdateWithSigners(signers, UpdateType.deposit, {
        nonce: 2,
        aliceSignature: undefined,
      });

      // Create the update to sync
      const result = await inbound(
        update,
        toSync,
        inbox,
        chainService,
        store,
        messaging,
        externalValidation,
        signers[1],
        logger,
      );
      expect(result.getError()?.message).to.be.eq(InboundChannelUpdateError.reasons.SyncFailure);
      expect(result.getError()?.context.error).to.be.eq("Cannot sync single signed state");

      // Verify nothing was saved and error properly sent
      expect(store.saveChannelState.callCount).to.be.eq(0);
      expect(messaging.respondToProtocolMessage.callCount).to.be.eq(0);
      expect(messaging.respondWithProtocolError.callCount).to.be.eq(1);
    });

    it("should fail if the missed update fails validation", async () => {
      // Set the store mock
      store.getChannelState.resolves({ nonce: 1 } as any);

      // Create the received update
      const update = createTestChannelUpdateWithSigners(signers, UpdateType.deposit, { nonce: 3 });

      // Create previous update
      const toSync = createTestChannelUpdateWithSigners(signers, UpdateType.deposit, {
        nonce: 2,
      });

      // Set validation mock
      validationStub.resolves(Result.fail(new Error("fail")));

      // Create the update to sync
      const result = await inbound(
        update,
        toSync,
        inbox,
        chainService,
        store,
        messaging,
        externalValidation,
        signers[1],
        logger,
      );
      expect(result.getError()!.message).to.be.eq(InboundChannelUpdateError.reasons.SyncFailure);
      expect(result.getError()!.context.error).to.be.eq("fail");

      // Verify nothing was saved and error properly sent
      expect(store.saveChannelState.callCount).to.be.eq(0);
      expect(messaging.respondToProtocolMessage.callCount).to.be.eq(0);
      expect(messaging.respondWithProtocolError.callCount).to.be.eq(1);
    });

    it("should fail if fails to save the synced channel", async () => {
      // Set the store mocks
      store.getChannelState.resolves({ nonce: 1 } as any);
      store.saveChannelState.rejects(new Error("fail"));

      // Create the received update
      const update = createTestChannelUpdateWithSigners(signers, UpdateType.deposit, { nonce: 3 });

      // Create previous update
      const toSync = createTestChannelUpdateWithSigners(signers, UpdateType.deposit, {
        nonce: 2,
      });

      // Set validation mock
      validationStub.resolves(Result.ok({ nonce: 2 } as any));

      // Create the update to sync
      const result = await inbound(
        update,
        toSync,
        inbox,
        chainService,
        store,
        messaging,
        externalValidation,
        signers[1],
        logger,
      );
      expect(result.getError()!.message).to.be.eq(InboundChannelUpdateError.reasons.SyncFailure);
      expect(result.getError()?.context.error).to.be.eq("fail");

      // Verify nothing was saved and error properly sent
      expect(store.saveChannelState.callCount).to.be.eq(1);
      expect(messaging.respondToProtocolMessage.callCount).to.be.eq(0);
      expect(messaging.respondWithProtocolError.callCount).to.be.eq(1);
    });

    describe("should properly sync channel and apply update", async () => {
      // Declare params
      const runTest = async (proposedType: UpdateType, typeToSync: UpdateType) => {
        // Set store mocks
        store.getChannelState.resolves({ nonce: 1, latestUpdate: {} as any } as any);

        // Set validation mocks
        const proposed = createTestChannelUpdateWithSigners(signers, proposedType, { nonce: 3 });
        const toSync = createTestChannelUpdateWithSigners(signers, typeToSync, { nonce: 2 });
        validationStub.onFirstCall().resolves(Result.ok({ updatedChannel: { nonce: 2, latestUpdate: toSync } }));
        validationStub.onSecondCall().resolves(Result.ok({ updatedChannel: { nonce: 3, latestUpdate: proposed } }));

        const result = await inbound(
          proposed,
          toSync,
          inbox,
          chainService,
          store,
          messaging,
          externalValidation,
          signers[1],
          logger,
        );
        expect(result.getError()).to.be.undefined;

        // Verify callstack
        expect(messaging.respondToProtocolMessage.callCount).to.be.eq(1);
        expect(messaging.respondWithProtocolError.callCount).to.be.eq(0);
        expect(store.saveChannelState.callCount).to.be.eq(2);
        expect(validationStub.callCount).to.be.eq(2);
        expect(validationStub.firstCall.args[3].nonce).to.be.eq(2);
        expect(validationStub.secondCall.args[3].nonce).to.be.eq(3);
      };

      for (const proposalType of Object.keys(UpdateType)) {
        if (proposalType === UpdateType.setup) {
          continue;
        }
        describe(`initiator trying to ${proposalType}`, () => {
          for (const toSyncType of Object.keys(UpdateType)) {
            if (toSyncType === UpdateType.setup) {
              continue;
            }
            it(`missed ${toSyncType}, should work`, async () => {
              await runTest(proposalType as UpdateType, toSyncType as UpdateType);
            });
          }
        });
      }
    });
  });

  it("IFF update is invalid and channel is out of sync, should fail on retry, but sync properly", async () => {
    // Set previous state
    store.getChannelState.resolves(createTestChannelStateWithSigners(signers, UpdateType.setup, { nonce: 1 }));

    // Set update to sync
    const prevUpdate = createTestChannelUpdateWithSigners(signers, UpdateType.deposit, {
      nonce: 2,
    });
    validationStub.onFirstCall().resolves(Result.ok({ updatedChannel: { nonce: 3, latestUpdate: {} as any } }));

    const update: ChannelUpdate<typeof UpdateType.deposit> = createTestChannelUpdateWithSigners(
      signers,
      UpdateType.deposit,
      {
        nonce: 3,
      },
    );
    validationStub
      .onSecondCall()
      .resolves(
        Result.fail(
          new InboundChannelUpdateError(InboundChannelUpdateError.reasons.InboundValidationFailed, update, {} as any),
        ),
      );
    const result = await inbound(
      update,
      prevUpdate,
      inbox,
      chainService,
      store,
      messaging,
      externalValidation,
      signers[1],
      logger,
    );

    expect(result.isError).to.be.true;
    const error = result.getError()!;
    expect(error.message).to.be.eq(InboundChannelUpdateError.reasons.InboundValidationFailed);
    expect(validationStub.callCount).to.be.eq(2);
    expect(validationStub.firstCall.args[3].nonce).to.be.eq(2);
    expect(validationStub.secondCall.args[3].nonce).to.be.eq(3);
    // Make sure the calls were correctly performed
    expect(store.saveChannelState.callCount).to.be.eq(1);
    expect(messaging.respondToProtocolMessage.callCount).to.be.eq(0);
  });

  it("should work if there is no channel state stored and you are receiving a setup update", async () => {
    // Generate the update
    const update: ChannelUpdate<typeof UpdateType.setup> = createTestChannelUpdateWithSigners(
      signers,
      UpdateType.setup,
      {
        nonce: 1,
      },
    );
    // Set the validation stub
    validationStub.resolves(Result.ok({ updatedChannel: {} as any }));
    const result = await inbound(
      update,
      update,
      inbox,
      chainService,
      store,
      messaging,
      externalValidation,
      signers[1],
      logger,
    );
    expect(result.getError()).to.be.undefined;

    // Make sure the calls were correctly performed
    expect(validationStub.callCount).to.be.eq(1);
    expect(messaging.respondToProtocolMessage.callCount).to.be.eq(1);
    expect(store.saveChannelState.callCount).to.be.eq(1);
  });
});

describe("outbound", () => {
  const chainProviders = env.chainProviders;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const providerUrl = Object.values(chainProviders)[0] as string;
  const { log } = getTestLoggers("outbound", env.logLevel);
  const channelAddress = mkAddress("0xccc");
  const externalValidation = {
    validateOutbound: (params: UpdateParams<any>, state: FullChannelState, activeTransfers: FullTransferState[]) =>
      Promise.resolve(Result.ok(undefined)),
    validateInbound: (update: ChannelUpdate<any>, state: FullChannelState, activeTransfers: FullTransferState[]) =>
      Promise.resolve(Result.ok(undefined)),
  };

  let signers: ChannelSigner[];
  let store: Sinon.SinonStubbedInstance<MemoryStoreService>;
  let messaging: Sinon.SinonStubbedInstance<MemoryMessagingService>;
  let chainService: Sinon.SinonStubbedInstance<VectorChainReader>;

  let validateUpdateSignatureStub: Sinon.SinonStub;
  let validateParamsAndApplyStub: Sinon.SinonStub;
  // called during sync
  let validateAndApplyInboundStub: Sinon.SinonStub;

  beforeEach(async () => {
    signers = Array(2)
      .fill(0)
      .map(() => getRandomChannelSigner(providerUrl));

    // Create all the services stubs
    store = Sinon.createStubInstance(MemoryStoreService);
    messaging = Sinon.createStubInstance(MemoryMessagingService);
    chainService = Sinon.createStubInstance(VectorChainReader);

    // Set the validation + generation mock
    validateParamsAndApplyStub = Sinon.stub(vectorValidation, "validateParamsAndApplyUpdate");
    validateAndApplyInboundStub = Sinon.stub(vectorValidation, "validateAndApplyInboundUpdate");

    // Stub out all signature validation
    validateUpdateSignatureStub = Sinon.stub(vectorUtils, "validateChannelUpdateSignatures").resolves(
      Result.ok(undefined),
    );
  });

  afterEach(() => {
    // Always restore stubs after tests
    Sinon.restore();
  });

  describe("should fail if .getChannelState / .getActiveTransfers / .getTransferState fails", () => {
    const methods = ["getChannelState", "getActiveTransfers"];

    for (const method of methods) {
      it(method, async () => {
        // Set store stub
        store[method].rejects("fail");

        // Make outbound call
        const result = await outbound(
          createTestUpdateParams(UpdateType.resolve),
          store,
          chainService,
          messaging,
          externalValidation,
          signers[0],
          log,
        );

        // Assert error
        expect(result.isError).to.be.eq(true);
        const error = result.getError()!;
        expect(error.message).to.be.eq(OutboundChannelUpdateError.reasons.StoreFailure);
        expect(error.context.message).to.include(method);
      });
    }
  });

  it("should fail if it fails to validate and apply the update", async () => {
    const params = createTestUpdateParams(UpdateType.deposit, { channelAddress: "0xfail" });

    // Stub the validation function
    const error = new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.InvalidParams, params);
    validateParamsAndApplyStub.resolves(Result.fail(error));

    const res = await outbound(params, store, chainService, messaging, externalValidation, signers[0], log);
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

    // Stub the generation function
    validateParamsAndApplyStub.resolves(
      Result.ok({
        update: createTestChannelUpdateWithSigners(signers, UpdateType.deposit),
        updatedTransfer: undefined,
        updatedActiveTransfers: undefined,
        updatedChannel: createTestChannelStateWithSigners(signers, UpdateType.deposit),
      }),
    );

    // Call the outbound function
    const res = await outbound(params, store, chainService, messaging, externalValidation, signers[0], log);

    // Verify the error is returned as an outbound error
    const error = res.getError();
    expect(error?.message).to.be.eq(OutboundChannelUpdateError.reasons.CounterpartyFailure);
    expect(error?.context).to.deep.eq({ counterpartyError: counterpartyError.message });

    // Verify message only sent once by initiator
    expect(messaging.sendProtocolMessage.callCount).to.be.eq(1);
  });

  it("should fail if it the signature validation fails", async () => {
    // Stub generation function
    validateParamsAndApplyStub.resolves(
      Result.ok({
        update: createTestChannelUpdateWithSigners(signers, UpdateType.deposit),
        updatedChannel: createTestChannelStateWithSigners(signers, UpdateType.deposit),
      }),
    );

    // Stub messaging
    messaging.sendProtocolMessage.resolves(
      Result.ok({ update: createTestChannelUpdateWithSigners(signers, UpdateType.deposit) } as any),
    );

    // Stub update signature
    validateUpdateSignatureStub.resolves(Result.fail(new Error("fail")));

    // Make outbound call
    const res = await outbound(
      createTestUpdateParams(UpdateType.deposit),
      store,
      chainService,
      messaging,
      externalValidation,
      signers[0],
      log,
    );
    expect(res.getError()!.message).to.be.eq(OutboundChannelUpdateError.reasons.BadSignatures);
  });

  it("should fail if the channel is not saved to store", async () => {
    // Stub save method to fail
    store.saveChannelState.rejects("Failed to save channel");

    const params = createTestUpdateParams(UpdateType.deposit, {
      channelAddress,
    });

    // Stub the generation results
    validateParamsAndApplyStub.resolves(
      Result.ok({
        update: createTestChannelUpdateWithSigners(signers, UpdateType.deposit),
        updatedTransfer: undefined,
        updatedActiveTransfers: undefined,
        updatedChannel: createTestChannelStateWithSigners(signers, UpdateType.deposit),
      }),
    );

    // Set the messaging mocks to return the proper update from the counterparty
    messaging.sendProtocolMessage.onFirstCall().resolves(Result.ok({ update: {}, previousUpdate: {} } as any));

    const result = await outbound(params, store, chainService, messaging, externalValidation, signers[0], log);

    expect(result.isError).to.be.true;
    const error = result.getError()!;
    expect(error.message).to.be.eq(OutboundChannelUpdateError.reasons.SaveChannelFailed);
  });

  it("should successfully initiate an update if channels are in sync", async () => {
    // Create the update (a user deposit on a setup channel)
    const assetId = AddressZero;
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

    // Stub the generation results
    validateParamsAndApplyStub.onFirstCall().resolves(
      Result.ok({
        update: createTestChannelUpdateWithSigners(signers, UpdateType.deposit),
        updatedTransfer: undefined,
        updatedActiveTransfers: undefined,
        updatedChannel: createTestChannelStateWithSigners(signers, UpdateType.deposit, { nonce: 3 }),
      }),
    );

    // Set the messaging mocks to return the proper update from the counterparty
    messaging.sendProtocolMessage // fails returning update to sync from
      .onFirstCall()
      .resolves(Result.ok({ update: {}, previousUpdate: {} } as any));

    // Call the outbound function
    const res = await outbound(params, store, chainService, messaging, externalValidation, signers[0], log);

    // Verify return values
    expect(res.getError()).to.be.undefined;
    expect(res.getValue().updatedChannel).to.containSubset({ nonce: 3 });

    // Verify message only sent once by initiator w/update to sync
    expect(messaging.sendProtocolMessage.callCount).to.be.eq(1);
    // Verify sync happened
    expect(validateParamsAndApplyStub.callCount).to.be.eq(1);
    expect(store.saveChannelState.callCount).to.be.eq(1);
  });

  describe("counterparty returned a StaleUpdate error, indicating the channel should try to sync (hitting `syncStateAndRecreateUpdate`)", () => {
    it("should fail to sync setup update", async () => {
      const proposedParams = createTestUpdateParams(UpdateType.deposit);

      // Set generation stub
      validateParamsAndApplyStub.resolves(
        Result.ok({
          update: createTestChannelUpdateWithSigners(signers, UpdateType.deposit),
          updatedChannel: createTestChannelStateWithSigners(signers, UpdateType.deposit),
        }),
      );

      // Stub counterparty return
      messaging.sendProtocolMessage.resolves(
        Result.fail(
          new InboundChannelUpdateError(
            InboundChannelUpdateError.reasons.StaleUpdate,
            createTestChannelUpdateWithSigners(signers, UpdateType.setup),
          ),
        ),
      );

      // Send request
      const result = await outbound(
        proposedParams,
        store,
        chainService,
        messaging,
        externalValidation,
        signers[0],
        log,
      );

      // Verify error
      expect(result.getError()?.message).to.be.eq(OutboundChannelUpdateError.reasons.SyncFailure);
      expect(result.getError()?.context.error).to.be.eq("Cannot sync setup update");
      // Verify update was not retried
      expect(messaging.sendProtocolMessage.callCount).to.be.eq(1);
      // Verify channel was not updated
      expect(store.saveChannelState.callCount).to.be.eq(0);
    });

    it("should fail if update to sync is single signed", async () => {
      const proposedParams = createTestUpdateParams(UpdateType.deposit);

      // Set generation stub
      validateParamsAndApplyStub.resolves(
        Result.ok({
          update: createTestChannelUpdateWithSigners(signers, UpdateType.deposit),
          updatedChannel: createTestChannelStateWithSigners(signers, UpdateType.deposit),
        }),
      );

      // Stub counterparty return
      messaging.sendProtocolMessage.resolves(
        Result.fail(
          new InboundChannelUpdateError(
            InboundChannelUpdateError.reasons.StaleUpdate,
            createTestChannelUpdateWithSigners(signers, UpdateType.deposit, {
              aliceSignature: undefined,
              bobSignature: mkSig(),
            }),
          ),
        ),
      );

      // Send request
      const result = await outbound(
        proposedParams,
        store,
        chainService,
        messaging,
        externalValidation,
        signers[0],
        log,
      );

      // Verify error
      expect(result.getError()?.message).to.be.eq(OutboundChannelUpdateError.reasons.SyncFailure);
      expect(result.getError()?.context.error).to.be.eq("Cannot sync single signed state");
      // Verify update was not retried
      expect(messaging.sendProtocolMessage.callCount).to.be.eq(1);
      // Verify channel was not updated
      expect(store.saveChannelState.callCount).to.be.eq(0);
    });

    it("should fail if it fails to apply the inbound update", async () => {
      // Set store mocks
      store.getChannelState.resolves(createTestChannelStateWithSigners(signers, UpdateType.deposit, { nonce: 2 }));

      // Set generation mock
      validateParamsAndApplyStub.resolves(
        Result.ok({
          update: createTestChannelUpdate(UpdateType.deposit),
          updatedChannel: createTestChannelUpdateWithSigners(signers, UpdateType.deposit, { nonce: 3 }),
        }),
      );

      // Stub counterparty return
      messaging.sendProtocolMessage.resolves(
        Result.fail(
          new InboundChannelUpdateError(
            InboundChannelUpdateError.reasons.StaleUpdate,
            createTestChannelUpdateWithSigners(signers, UpdateType.deposit, {
              nonce: 3,
            }),
          ),
        ),
      );

      // Stub the sync inbound function
      validateAndApplyInboundStub.resolves(Result.fail(new Error("fail")));

      // Send request
      const result = await outbound(
        createTestUpdateParams(UpdateType.deposit),
        store,
        chainService,
        messaging,
        externalValidation,
        signers[0],
        log,
      );

      // Verify error
      expect(result.getError()?.message).to.be.eq(OutboundChannelUpdateError.reasons.SyncFailure);
      expect(result.getError()?.context.error).to.be.eq("fail");
      // Verify update was not retried
      expect(messaging.sendProtocolMessage.callCount).to.be.eq(1);
      // Verify channel was not updated
      expect(store.saveChannelState.callCount).to.be.eq(0);
    });

    it("should fail if it cannot save synced channel to store", async () => {
      // Set the apply/update return value
      const applyRet = {
        update: createTestChannelUpdate(UpdateType.deposit),
        updatedChannel: createTestChannelUpdateWithSigners(signers, UpdateType.deposit, { nonce: 3 }),
      };

      // Set store mocks
      store.getChannelState.resolves(createTestChannelStateWithSigners(signers, UpdateType.deposit, { nonce: 2 }));
      store.saveChannelState.rejects("fail");

      // Set generation mock
      validateParamsAndApplyStub.resolves(Result.ok(applyRet));

      // Stub counterparty return
      messaging.sendProtocolMessage.resolves(
        Result.fail(
          new InboundChannelUpdateError(
            InboundChannelUpdateError.reasons.StaleUpdate,
            createTestChannelUpdateWithSigners(signers, UpdateType.deposit, {
              nonce: 3,
            }),
          ),
        ),
      );

      // Stub the apply function
      validateAndApplyInboundStub.resolves(Result.ok(applyRet));

      // Send request
      const result = await outbound(
        createTestUpdateParams(UpdateType.deposit),
        store,
        chainService,
        messaging,
        externalValidation,
        signers[0],
        log,
      );

      // Verify error
      expect(result.getError()?.message).to.be.eq(OutboundChannelUpdateError.reasons.SyncFailure);
      // Verify update was not retried
      expect(messaging.sendProtocolMessage.callCount).to.be.eq(1);
      // Verify channel save was attempted
      expect(store.saveChannelState.callCount).to.be.eq(1);
    });

    it("should fail if it cannot re-validate proposed parameters", async () => {
      // Set the apply/update return value
      const applyRet = {
        update: createTestChannelUpdate(UpdateType.deposit),
        updatedChannel: createTestChannelUpdateWithSigners(signers, UpdateType.deposit, { nonce: 3 }),
      };

      // Set store mocks
      store.getChannelState.resolves(createTestChannelStateWithSigners(signers, UpdateType.deposit, { nonce: 2 }));

      // Set generation mock
      validateParamsAndApplyStub.onFirstCall().resolves(Result.ok(applyRet));
      validateParamsAndApplyStub.onSecondCall().resolves(Result.fail(new Error("fail")));

      // Stub counterparty return
      messaging.sendProtocolMessage.resolves(
        Result.fail(
          new InboundChannelUpdateError(
            InboundChannelUpdateError.reasons.StaleUpdate,
            createTestChannelUpdateWithSigners(signers, UpdateType.deposit, {
              nonce: 3,
            }),
          ),
        ),
      );

      // Stub the sync function
      validateAndApplyInboundStub.resolves(Result.ok(applyRet));

      // Send request
      const result = await outbound(
        createTestUpdateParams(UpdateType.deposit),
        store,
        chainService,
        messaging,
        externalValidation,
        signers[0],
        log,
      );

      // Verify error
      expect(result.getError()?.message).to.be.eq(OutboundChannelUpdateError.reasons.RegenerateUpdateFailed);
      expect(result.getError()?.context.error).to.be.eq("fail");
      // Verify update was not retried
      expect(messaging.sendProtocolMessage.callCount).to.be.eq(1);
      // Verify channel save was called
      expect(store.saveChannelState.callCount).to.be.eq(1);
    });

    // responder nonce n, proposed update nonce by initiator is at n too.
    // then if update is valid for synced channel then initiator nonce is n+1
    describe("should properly sync channel and recreate update", async () => {
      // Declare test params
      let preSyncState;
      let preSyncUpdatedState;
      let params;
      let preSyncUpdate;
      let postSyncUpdate;

      // create a helper to create the proper counterparty error
      const createInboundError = (updateToSync: ChannelUpdate): any => {
        return Result.fail(new InboundChannelUpdateError(InboundChannelUpdateError.reasons.StaleUpdate, updateToSync));
      };

      // create a helper to create a post-sync state
      const createUpdatedState = (update: ChannelUpdate): FullChannelState => {
        return createTestChannelStateWithSigners(signers, update.type, {
          latestUpdate: update,
          nonce: update.nonce,
        });
      };

      // create a helper to create a update to sync state
      const createUpdateToSync = (type: UpdateType): ChannelUpdate => {
        return createTestChannelUpdateWithSigners(signers, type, {
          nonce: 4,
        });
      };

      // create a helper to establish mocks
      const createTestEnv = (typeToSync: UpdateType): void => {
        // Create the missed update
        const toSync = createUpdateToSync(typeToSync);

        // If it is resolve, make sure the store returns this in the
        // active transfers + the proper transfer state
        if (typeToSync === UpdateType.resolve) {
          const transfer = createTestFullHashlockTransferState({ transferId: toSync.details.transferId });
          store.getActiveTransfers.resolves([transfer]);
          store.getTransferState.resolves({ ...transfer, transferResolver: undefined });
          chainService.resolve.resolves(Result.ok(transfer.balance));
        } else {
          // otherwise, assume no other active transfers
          store.getActiveTransfers.resolves([]);
        }

        // Set messaging mocks:
        // - first call should return an error
        // - second call should return a final channel state
        messaging.sendProtocolMessage.onFirstCall().resolves(createInboundError(toSync));
        messaging.sendProtocolMessage
          .onSecondCall()
          .resolves(Result.ok({ update: postSyncUpdate, previousUpdate: toSync }));

        // Stub apply-sync results
        validateAndApplyInboundStub.resolves(
          Result.ok({
            update: toSync,
            updatedChannel: createUpdatedState(toSync),
          }),
        );

        // Stub the generation results post-sync
        validateParamsAndApplyStub.onSecondCall().resolves(
          Result.ok({
            update: postSyncUpdate,
            updatedChannel: createUpdatedState(postSyncUpdate),
          }),
        );
      };

      // create a helper to verify calling + code path
      const runTest = async (typeToSync: UpdateType): Promise<void> => {
        createTestEnv(typeToSync);

        // Call the outbound function
        const res = await outbound(params, store, chainService, messaging, externalValidation, signers[0], log);

        // Verify the update was successfully sent + retried
        expect(res.getError()).to.be.undefined;
        expect(res.getValue().updatedChannel).to.be.containSubset({
          nonce: postSyncUpdate.nonce,
          latestUpdate: postSyncUpdate,
        });
        expect(messaging.sendProtocolMessage.callCount).to.be.eq(2);
        expect(store.saveChannelState.callCount).to.be.eq(2);
        expect(validateParamsAndApplyStub.callCount).to.be.eq(2);
        expect(validateAndApplyInboundStub.callCount).to.be.eq(1);
        expect(validateUpdateSignatureStub.callCount).to.be.eq(1);
      };

      describe("initiator trying deposit", () => {
        beforeEach(() => {
          // Create the test params
          preSyncState = createTestChannelStateWithSigners(signers, UpdateType.deposit, { nonce: 3 });
          preSyncUpdatedState = createTestChannelStateWithSigners(signers, UpdateType.deposit, { nonce: 4 });

          params = createTestUpdateParams(UpdateType.deposit);
          preSyncUpdate = createTestChannelUpdateWithSigners(signers, UpdateType.deposit, { nonce: 4 });
          postSyncUpdate = createTestChannelUpdateWithSigners(signers, UpdateType.deposit, { nonce: 5 });

          // Set the stored state
          store.getChannelState.resolves(preSyncState);

          // Set the apply values on the first call
          validateParamsAndApplyStub.onFirstCall().resolves(
            Result.ok({
              update: preSyncUpdate,
              updatedChannel: preSyncUpdatedState,
            }),
          );
        });

        afterEach(() => {
          // Always restore stubs after tests
          Sinon.restore();
        });

        for (const type of Object.keys(UpdateType)) {
          // Dont sync setup
          if (type === UpdateType.setup) {
            continue;
          }
          it(`missed ${type}, should work`, async () => {
            await runTest(type as UpdateType);
          });
        }
      });

      describe("initiator trying create", () => {
        beforeEach(() => {
          // Create the test params
          preSyncState = createTestChannelStateWithSigners(signers, UpdateType.deposit, { nonce: 3 });
          preSyncUpdatedState = createTestChannelStateWithSigners(signers, UpdateType.create, { nonce: 4 });

          params = createTestUpdateParams(UpdateType.create);
          preSyncUpdate = createTestChannelUpdateWithSigners(signers, UpdateType.create, { nonce: 4 });
          postSyncUpdate = createTestChannelUpdateWithSigners(signers, UpdateType.create, { nonce: 5 });

          // Set the stored state
          store.getChannelState.resolves(preSyncState);

          // Set the apply values on the first call
          validateParamsAndApplyStub.onFirstCall().resolves(
            Result.ok({
              update: preSyncUpdate,
              updatedChannel: preSyncUpdatedState,
            }),
          );
        });

        afterEach(() => {
          // Always restore stubs after tests
          Sinon.restore();
        });

        for (const type of Object.keys(UpdateType)) {
          // Dont sync setup
          if (type === UpdateType.setup) {
            continue;
          }
          it(`missed ${type}, should work`, async () => {
            await runTest(type as UpdateType);
          });
        }
      });

      describe("initiator trying resolve", () => {
        beforeEach(() => {
          // Create the test params
          preSyncState = createTestChannelStateWithSigners(signers, UpdateType.deposit, { nonce: 3 });
          preSyncUpdatedState = createTestChannelStateWithSigners(signers, UpdateType.resolve, { nonce: 4 });

          params = createTestUpdateParams(UpdateType.resolve);
          preSyncUpdate = createTestChannelUpdateWithSigners(signers, UpdateType.resolve, { nonce: 4 });
          postSyncUpdate = createTestChannelUpdateWithSigners(signers, UpdateType.resolve, { nonce: 5 });

          // Set the stored state
          store.getChannelState.resolves(preSyncState);

          // Set the apply values on the first call
          validateParamsAndApplyStub.onFirstCall().resolves(
            Result.ok({
              update: preSyncUpdate,
              updatedChannel: preSyncUpdatedState,
            }),
          );
        });

        afterEach(() => {
          // Always restore stubs after tests
          Sinon.restore();
        });

        for (const type of Object.keys(UpdateType)) {
          // Dont sync setup
          if (type === UpdateType.setup) {
            continue;
          }
          it(`missed ${type}, should work`, async () => {
            await runTest(type as UpdateType);
          });
        }
      });
    });
  });
});
