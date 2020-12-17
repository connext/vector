import { VectorChainService } from "@connext/vector-contracts";
import { Result, EngineParams, DEFAULT_CHANNEL_TIMEOUT } from "@connext/vector-types";
import {
  expect,
  getRandomChannelSigner,
  getTestLoggers,
  MemoryStoreService,
  MemoryMessagingService,
  MemoryLockService,
  getRandomBytes32,
  mkPublicIdentifier,
  mkAddress,
} from "@connext/vector-utils";
import Sinon from "sinon";

import { VectorEngine } from "../index";

import { env } from "./env";

describe("VectorEngine", () => {
  const chainId = parseInt(Object.keys(env.chainProviders)[0]);
  const chainAddresses = {
    [chainId]: {
      ...env.chainAddresses,
    },
  };

  const testName = "VectorEngine index utils";
  const { log } = getTestLoggers(testName, env.logLevel);
  let chainService: Sinon.SinonStubbedInstance<VectorEngine>;

  const aliceIdentifier = mkPublicIdentifier("vectorA");
  const bobIdentifier = mkPublicIdentifier("vectorB");
  const counterpartyIdentifier = mkPublicIdentifier("vectorC");
  const validAddress = mkAddress("0xc");
  const invalidAddress = "abc";

  let storeService;
  beforeEach(() => {
    storeService = Sinon.createStubInstance(MemoryStoreService, {
      getChannelStates: Promise.resolve([]),
    });
    chainService = Sinon.createStubInstance(VectorEngine);
  });

  afterEach(() => Sinon.restore());

  it("should connect without validation", async () => {
    const engine = await VectorEngine.connect(
      Sinon.createStubInstance(MemoryMessagingService),
      Sinon.createStubInstance(MemoryLockService),
      storeService,
      getRandomChannelSigner(),
      Sinon.createStubInstance(VectorChainService),
      chainAddresses,
      log,
    );
    expect(engine).to.be.instanceOf(VectorEngine);
  });

  it("should connect with validation", async () => {
    const engine = await VectorEngine.connect(
      Sinon.createStubInstance(MemoryMessagingService),
      Sinon.createStubInstance(MemoryLockService),
      storeService,
      getRandomChannelSigner(),
      Sinon.createStubInstance(VectorChainService),
      chainAddresses,
      log,
      {
        validateInbound: (update, state, transfer) => Promise.resolve(Result.ok(undefined)),
        validateOutbound: (params, state, transfer) => Promise.resolve(Result.ok(undefined)),
      },
    );
    expect(engine).to.be.instanceOf(VectorEngine);
  });

  // TODO: all methods should have tests that ensure every failure can be hit
  // below outlines only the most important (i.e. functions with the most
  // complex logic within the index file of the module)

  // NOTE: these are nice-to-haves

  describe.skip("setup", () => {
    it("should fail if it cannot get chainProviders", async () => {});
    it("should fail if vector.setup fails", async () => {});
    it("should work when signer is bob", async () => {});
    describe("should work when signer is alice", () => {
      it("should work without deploying contract", async () => {});
      it("should try to deploy channel on autodeployable chain", async () => {});
    });
  });

  // NOTE: these are nice-to-haves
  describe.skip("withdraw", () => {
    it("should fail if getting channel fails", async () => {});
    it("should fail if the channel is undefined", async () => {});
    it("should fail if it cannot convert the params", async () => {});
    it("should fail if vector.create fails", async () => {});
    it("should resolve with the transactionHash once the withdrawal is reconciled", async () => {});
    it("should resolve without the transactionHash once the withdrawal is reconciled if no event is emitted", async () => {});
  });

  // NOTE: if any of these change we have broken the rpc interface!
  describe("should properly parse rpc request schema", async () => {
    const tests = [
      {
        name: "no request.id",
        overrides: { id: 1, jsonrpc: "2.0", method: "chan_getConfig", params: undefined },
        error: "should have required property 'id'",
      },
      {
        name: "malformed request.id",
        overrides: { id: -1, jsonrpc: "2.0", method: "chan_getConfig", params: undefined },
        error: "should be >= 1",
      },
      {
        name: "request.id is not a number",
        overrides: { id: "ab", jsonrpc: "2.0", method: "chan_getConfig", params: undefined },
        error: "should be number",
      },
      {
        name: "no request.jsonrpc",
        overrides: { id: 1, jsonrpc: undefined, method: "chan_getConfig", params: undefined },
        error: "should have required property 'jsonrpc'",
      },
      {
        name: "malformed request.jsonrpc",
        overrides: { id: 1, jsonrpc: "3.0", method: "chan_getConfig", params: undefined },
        error: "should be equal to one of the allowed values",
      },
      {
        name: "no request.method",
        overrides: { id: 1, jsonrpc: "2.0", method: undefined, params: undefined },
        error: "should have required property 'method'",
      },
      {
        name: "malformed request.method",
        overrides: { id: 1, jsonrpc: "2.0", method: "invalid_method", params: undefined },
        error: "should be equal",
      },
      {
        name: "missing chan_ prefix from request.method",
        overrides: { id: 1, jsonrpc: "2.0", method: "getConfig", params: undefined },
        error: "should be equal",
      },
    ];
    for (const test of tests) {
      it(test.name, async () => {
        const engine = await VectorEngine.connect(
          Sinon.createStubInstance(MemoryMessagingService),
          Sinon.createStubInstance(MemoryLockService),
          storeService,
          getRandomChannelSigner(),
          Sinon.createStubInstance(VectorChainService),
          chainAddresses,
          log,
        );
        let rpc: EngineParams.RpcRequest = { ...test.overrides } as any;
        try {
          await engine.request(rpc);
        } catch (res) {
          expect(res.message).to.contain(test.error);
        }
      });
    }

    describe("should fail if it has malformed request.params", async () => {
      const malformedPublicIdentifier = 'should match pattern "^vector([a-zA-Z0-9]{50})$"';
      const malformedAddress = 'should match pattern "^0x[a-fA-F0-9]{40}$"';
      const malformedTransactionId = 'should match pattern "^0x([a-fA-F0-9]{64})$"';
      const malformedTimeout = 'should match pattern "^([0-9])*$"';
      const missingParam = (param): string => {
        return `should have required property '${param}'`;
      };
      const paramsTests = [
        {
          name: "chan_signUtilityMessage missing parameter message",
          overrides: { id: 1, jsonrpc: "2.0", method: "chan_signUtilityMessage", params: { message: undefined } },
          error: missingParam("message"),
        },
        {
          name: "chan_signUtilityMessage malformed parameter message",
          overrides: { id: 1, jsonrpc: "2.0", method: "chan_signUtilityMessage", params: { message: 1 } },
          error: "should be string",
        },
        {
          name: "chan_getChannelState missing parameter channelAddress",
          overrides: { id: 1, jsonrpc: "2.0", method: "chan_getChannelState", params: { undefined } },
          error: missingParam("channelAddress"),
        },
        {
          name: "chan_getChannelState malformed parameter channelAddress",
          overrides: {
            id: 1,
            jsonrpc: "2.0",
            method: "chan_getChannelState",
            params: { channelAddress: invalidAddress },
          },
          error: malformedAddress,
        },
        {
          name: "chan_getChannelStateByParticipants missing parameter alice",
          overrides: { method: "chan_getChannelStateByParticipants", params: { bob: bobIdentifier, chainId: 1 } },
          error: missingParam("alice"),
        },
        {
          name: "chan_getChannelStateByParticipants missing parameter bob",
          overrides: { method: "chan_getChannelStateByParticipants", params: { alice: aliceIdentifier, chainId: 1 } },
          error: missingParam("bob"),
        },
        {
          name: "chan_getChannelStateByParticipants missing parameter chainId",
          overrides: {
            method: "chan_getChannelStateByParticipants",
            params: { alice: aliceIdentifier, bob: bobIdentifier },
          },
          error: missingParam("chainId"),
        },
        {
          name: "chan_getChannelStateByParticipants malformed parameter alice",
          overrides: {
            method: "chan_getChannelStateByParticipants",
            params: { alice: invalidAddress, bob: bobIdentifier, chainId: 1 },
          },
          error: malformedPublicIdentifier,
        },
        {
          name: "chan_getChannelStateByParticipants malformed parameter bob",
          overrides: {
            method: "chan_getChannelStateByParticipants",
            params: { alice: aliceIdentifier, bob: invalidAddress, chainId: 1 },
          },
          error: malformedPublicIdentifier,
        },
        {
          name: "chan_getChannelStateByParticipants malformed parameter chainId",
          overrides: {
            method: "chan_getChannelStateByParticipants",
            params: { alice: aliceIdentifier, bob: bobIdentifier, chainId: -1 },
          },
          error: "should be >= 1",
        },
        {
          name: "chan_getTransferStateByRoutingId missing parameter channelAddress",
          overrides: { method: "chan_getTransferStateByRoutingId", params: { routingId: validAddress } },
          error: missingParam("channelAddress"),
        },
        {
          name: "chan_getTransferStateByRoutingId missing parameter routingId",
          overrides: { method: "chan_getTransferStateByRoutingId", params: { channelAddress: validAddress } },
          error: missingParam("routingId"),
        },
        {
          name: "chan_getTransferStateByRoutingId malformed parameter chainAddress",
          overrides: {
            method: "chan_getTransferStateByRoutingId",
            params: { channelAddress: invalidAddress, routingId: invalidAddress },
          },
          error: malformedAddress,
        },
        {
          name: "chan_getTransferStateByRoutingId malformed parameter routingId",
          overrides: {
            method: "chan_getTransferStateByRoutingId",
            params: { channelAddress: validAddress, routingId: invalidAddress },
          },
          error: malformedTransactionId,
        },
        {
          name: "chan_getTransferStatesByRoutingId missing parameter routingId",
          overrides: { method: "chan_getTransferStatesByRoutingId", params: { undefined } },
          error: missingParam("routingId"),
        },
        {
          name: "chan_getTransferStatesByRoutingId malformed parameter routingId",
          overrides: { method: "chan_getTransferStatesByRoutingId", params: { routingId: invalidAddress } },
          error: malformedTransactionId,
        },
        {
          name: "chan_getActiveTransfers missing parameter channelAddress",
          overrides: { method: "chan_getActiveTransfers", params: { undefined } },
          error: missingParam("channelAddress"),
        },
        {
          name: "chan_getActiveTransfers malformed parameter channelAddress",
          overrides: { method: "chan_getActiveTransfers", params: { channelAddress: invalidAddress } },
          error: malformedAddress,
        },
        {
          name: "chan_getTransferState missing parameter transferId",
          overrides: { method: "chan_getTransferState", params: { undefined } },
          error: missingParam("transferId"),
        },
        {
          name: "chan_getTransferState malformed parameter transferId",
          overrides: { method: "chan_getTransferState", params: { transferId: invalidAddress } },
          error: malformedTransactionId,
        },
        {
          name: "chan_getRegisteredTransfers missing parameter chainId",
          overrides: { method: "chan_getRegisteredTransfers", params: { undefined } },
          error: missingParam("chainId"),
        },
        {
          name: "chan_getRegisteredTransfers malformed parameter chainId",
          overrides: { method: "chan_getRegisteredTransfers", params: { chainId: -1 } },
          error: "should be >= 1",
        },
        {
          name: "chan_setup missing parameter chainId",
          overrides: {
            method: "chan_setup",
            params: { counterpartyIdentifier: counterpartyIdentifier, timeout: "1000" },
          },
          error: missingParam("chainId"),
        },
        {
          name: "chan_setup missing parameter counterpartyIdentifier",
          overrides: { method: "chan_setup", params: { chainId: 1, timeout: "1000" } },
          error: missingParam("counterpartyIdentifier"),
        },
        {
          name: "chan_setup missing parameter timeout",
          overrides: { method: "chan_setup", params: { chainId: 1, counterpartyIdentifier: counterpartyIdentifier } },
          error: missingParam("timeout"),
        },
        {
          name: "chan_setup malformed parameter chainId",
          overrides: {
            method: "chan_setup",
            params: { chainId: -1, counterpartyIdentifier: counterpartyIdentifier, timeout: "1000" },
          },
          error: "should be >= 1",
        },
        {
          name: "chan_setup malformed parameter counterpartyIdentifier",
          overrides: {
            method: "chan_setup",
            params: { chainId: 1, counterpartyIdentifier: invalidAddress, timeout: "1000" },
          },
          error: malformedPublicIdentifier,
        },
        {
          name: "chan_setup malformed parameter timeout",
          overrides: {
            method: "chan_setup",
            params: { chainId: 1, counterpartyIdentifier: counterpartyIdentifier, timeout: "-1000" },
          },
          error: malformedTimeout,
        },
        {
          name: "chan_requestSetup missing parameter chainId",
          overrides: {
            method: "chan_requestSetup",
            params: { counterpartyIdentifier: counterpartyIdentifier, timeout: "1000" },
          },
          error: missingParam("chainId"),
        },
        {
          name: "chan_requestSetup missing parameter counterpartyIdentifier",
          overrides: { method: "chan_requestSetup", params: { chainId: 1, timeout: "1000" } },
          error: missingParam("counterpartyIdentifier"),
        },
        {
          name: "chan_requestSetup missing parameter timeout",
          overrides: {
            method: "chan_requestSetup",
            params: { chainId: 1, counterpartyIdentifier: counterpartyIdentifier },
          },
          error: missingParam("timeout"),
        },
        {
          name: "chan_requestSetup malformed parameter chainId",
          overrides: {
            method: "chan_requestSetup",
            params: { chainId: -1, counterpartyIdentifier: counterpartyIdentifier, timeout: "1000" },
          },
          error: "should be >= 1",
        },
        {
          name: "chan_requestSetup malformed parameter counterpartyIdentifier",
          overrides: {
            method: "chan_requestSetup",
            params: { chainId: 1, counterpartyIdentifier: invalidAddress, timeout: "1000" },
          },
          error: malformedPublicIdentifier,
        },
        {
          name: "chan_requestSetup malformed parameter timeout",
          overrides: {
            method: "chan_requestSetup",
            params: { chainId: 1, counterpartyIdentifier: counterpartyIdentifier, timeout: "-1000" },
          },
          error: malformedTimeout,
        },

        {
          name: "chan_deposit missing parameter channelAddress",
          overrides: { method: "chan_deposit", params: { assetId: validAddress } },
          error: missingParam("channelAddress"),
        },
        {
          name: "chan_deposit missing parameter assetId",
          overrides: { method: "chan_deposit", params: { channelAddress: validAddress } },
          error: missingParam("assetId"),
        },
        {
          name: "chan_deposit malformed parameter channelAddress",
          overrides: { method: "chan_deposit", params: { channelAddress: invalidAddress, assetId: validAddress } },
          error: malformedAddress,
        },
        {
          name: "chan_deposit malformed parameter assetId",
          overrides: { method: "chan_deposit", params: { channelAddress: validAddress, assetId: invalidAddress } },
          error: malformedAddress,
        },

        {
          name: "chan_requestCollateral missing parameter channelAddress",
          overrides: { method: "chan_requestCollateral", params: { assetId: validAddress } },
          error: missingParam("channelAddress"),
        },
        {
          name: "chan_requestCollateral missing parameter assetId",
          overrides: { method: "chan_requestCollateral", params: { channelAddress: validAddress } },
          error: missingParam("assetId"),
        },
        {
          name: "chan_requestCollateral malformed parameter channelAddress",
          overrides: {
            method: "chan_requestCollateral",
            params: { channelAddress: invalidAddress, assetId: validAddress },
          },
          error: malformedAddress,
        },
        {
          name: "chan_requestCollateral malformed parameter assetId",
          overrides: {
            method: "chan_requestCollateral",
            params: { channelAddress: validAddress, assetId: invalidAddress },
          },
          error: malformedAddress,
        },
        {
          name: "chan_createTransfer missing parameter channelAddress",
          overrides: {
            method: "chan_createTransfer",
            params: {
              amount: "1",
              assetId: validAddress,
              type: "TransferNameSchema",
              details: {},
              recipient: validAddress,
              recipientChainId: 1,
              recipientAssetId: validAddress,
              timeout: "1000",
            },
          },
          error: missingParam("channelAddress"),
        },
        {
          name: "chan_createTransfer missing parameter amount",
          overrides: {
            method: "chan_createTransfer",
            params: {
              channelAddress: validAddress,
              assetId: validAddress,
              type: "TransferNameSchema",
              details: {},
              recipient: validAddress,
              recipientChainId: 1,
              timeout: "1000",
            },
          },
          error: missingParam("amount"),
        },
        {
          name: "chan_createTransfer missing parameter type",
          overrides: {
            method: "chan_createTransfer",
            params: {
              channelAddress: validAddress,
              amount: "1",
              assetId: validAddress,
              details: {},
              recipientChainId: 1,
              timeout: "1000",
            },
          },
          error: missingParam("type"),
        },
        {
          name: "chan_createTransfer missing parameter details",
          overrides: {
            method: "chan_createTransfer",
            params: {
              channelAddress: validAddress,
              amount: "1",
              assetId: validAddress,
              type: "TransferNameSchema",
              recipientChainId: 1,
              timeout: "1000",
            },
          },
          error: missingParam(".details"),
        },
        {
          name: "chan_createTransfer malformed parameter channelAddress",
          overrides: {
            method: "chan_createTransfer",
            params: {
              channelAddress: invalidAddress,
              amount: "1",
              assetId: validAddress,
              type: "TransferNameSchema",
              details: {},
              recipientChainId: 1,
              timeout: "1000",
            },
          },
          error: malformedAddress,
        },
        {
          name: "chan_createTransfer malformed parameter amount",
          overrides: {
            method: "chan_createTransfer",
            params: {
              channelAddress: validAddress,
              amount: "-1",
              assetId: validAddress,
              type: "TransferNameSchema",
              details: {},
              recipientChainId: 1,
              timeout: "1000",
            },
          },
          error: 'should match pattern "^([0-9])*$"',
        },
        {
          name: "chan_createTransfer malformed parameter type",
          overrides: {
            method: "chan_createTransfer",
            params: {
              channelAddress: validAddress,
              amount: "1",
              assetId: validAddress,
              type: "",
              details: {},
              recipientChainId: 1,
              timeout: "1000",
            },
          },
          error: "No channel found in storage",
        },
        {
          name: "chan_createTransfer malformed parameter recipientChainId",
          overrides: {
            method: "chan_createTransfer",
            params: {
              channelAddress: validAddress,
              amount: "1",
              assetId: validAddress,
              type: "TransferNameSchema",
              details: {},
              recipientChainId: -1,
              timeout: "1000",
            },
          },
          error: "should be >= 1",
        },
        {
          name: "chan_createTransfer malformed parameter timeout",
          overrides: {
            method: "chan_createTransfer",
            params: {
              channelAddress: validAddress,
              amount: "1",
              assetId: validAddress,
              type: "TransferNameSchema",
              details: {},
              recipientChainId: 1,
              timeout: "-1000",
            },
          },
          error: malformedTimeout,
        },
        {
          name: "chan_resolveTransfer missing parameter channelAddress",
          overrides: {
            method: "chan_resolveTransfer",
            params: { transferId: "0x", transferResolver: { preImage: getRandomBytes32() } },
          },
          error: missingParam("channelAddress"),
        },
        {
          name: "chan_resolveTransfer missing parameter transferId",
          overrides: {
            method: "chan_resolveTransfer",
            params: { channelAddress: validAddress, transferResolver: { preImage: getRandomBytes32() } },
          },
          error: missingParam("transferId"),
        },
        {
          name: "chan_resolveTransfer missing parameter transferResolver",
          overrides: {
            method: "chan_resolveTransfer",
            params: { channelAddress: validAddress, transferId: getRandomBytes32() },
          },
          error: missingParam("transferResolver"),
        },
        {
          name: "chan_resolveTransfer malformed parameter channelAddress",
          overrides: {
            method: "chan_resolveTransfer",
            params: {
              channelAddress: invalidAddress,
              transferId: "0x",
              transferResolver: { preImage: getRandomBytes32() },
            },
          },
          error: malformedAddress,
        },
        {
          name: "chan_resolveTransfer malformed parameter transferId",
          overrides: {
            method: "chan_resolveTransfer",
            params: {
              channelAddress: validAddress,
              transferId: invalidAddress,
              transferResolver: { preImage: getRandomBytes32() },
            },
          },
          error: malformedTransactionId,
        },
        {
          name: "chan_resolveTransfer malformed parameter transferResolver",
          overrides: {
            method: "chan_resolveTransfer",
            params: {
              channelAddress: validAddress,
              transferId: "0x",
              transferResolver: { preImage: invalidAddress },
            },
          },
          error: malformedTransactionId,
        },

        {
          name: "chan_withdraw missing parameter channelAddress",
          overrides: {
            method: "chan_withdraw",
            params: { amount: "1", assetId: validAddress, recipient: validAddress },
          },
          error: missingParam("channelAddress"),
        },
        {
          name: "chan_withdraw missing parameter amount",
          overrides: {
            method: "chan_withdraw",
            params: { channelAddress: validAddress, assetId: validAddress, recipient: validAddress },
          },
          error: missingParam("amount"),
        },
        {
          name: "chan_withdraw missing parameter assetId",
          overrides: {
            method: "chan_withdraw",
            params: { channelAddress: validAddress, amount: "1", recipient: validAddress },
          },
          error: missingParam("assetId"),
        },
        {
          name: "chan_withdraw missing parameter recipient",
          overrides: {
            method: "chan_withdraw",
            params: { channelAddress: validAddress, amount: "1", assetId: validAddress },
          },
          error: missingParam("recipient"),
        },
        {
          name: "chan_withdraw malformed parameter channelAddress",
          overrides: {
            method: "chan_withdraw",
            params: { channelAddress: invalidAddress, amount: "1", assetId: validAddress, recipient: validAddress },
          },
          error: malformedAddress,
        },
        {
          name: "chan_withdraw malformed parameter amount",
          overrides: {
            method: "chan_withdraw",
            params: { channelAddress: validAddress, amount: "-1", assetId: validAddress, recipient: validAddress },
          },
          error: 'should match pattern "^([0-9])*$"',
        },
        {
          name: "chan_withdraw malformed parameter assetId",
          overrides: {
            method: "chan_withdraw",
            params: { channelAddress: validAddress, amount: "1", assetId: invalidAddress, recipient: validAddress },
          },
          error: malformedAddress,
        },
        {
          name: "chan_withdraw malformed parameter recipient",
          overrides: {
            method: "chan_withdraw",
            params: { channelAddress: validAddress, amount: "1", assetId: validAddress, recipient: invalidAddress },
          },
          error: malformedAddress,
        },

        {
          name: "chan_subscribe missing parameter event",
          overrides: { method: "chan_subscribe", params: { once: true } },
          error: "Invalid method: subscribe",
        },
        {
          name: "chan_subscribe missing parameter once",
          overrides: { method: "chan_subscribe", params: { event: invalidAddress } },
          error: "Invalid method: subscribe",
        },
        {
          name: "chan_subscribe malformed parameter event",
          overrides: { method: "chan_subscribe", params: { event: invalidAddress, once: true } },
          error: "Invalid method: subscribe",
        },
        {
          name: "chan_subscribe malformed parameter once",
          overrides: { method: "chan_subscribe", params: { event: invalidAddress, once: "true" } },
          error: "Invalid method: subscribe",
        },
        {
          name: "connext_authenticate malformed parameter signature",
          overrides: { method: "connext_authenticate", params: { signature: invalidAddress } },
          error: "Invalid method: connext_authenticate",
        },

        {
          name: "chan_dispute missing parameter channelAddress",
          overrides: { method: "chan_dispute", params: { undefined } },
          error: "Invalid method: dispute",
        },
        {
          name: "chan_dispute malformed parameter channelAddress",
          overrides: { method: "chan_dispute", params: { channelAddress: invalidAddress } },
          error: "Invalid method: dispute",
        },

        {
          name: "chan_defund missing parameter channelAddress",
          overrides: { method: "chan_defund", params: { undefined } },
          error: "Invalid method: defund",
        },
        {
          name: "chan_defund malformed parameter channelAddress",
          overrides: { method: "chan_defund", params: { channelAddress: invalidAddress } },
          error: "Invalid method: defund",
        },

        {
          name: "chan_disputeTransfer missing parameter transferId",
          overrides: { method: "chan_disputeTransfer", params: { undefined } },
          error: missingParam("transferId"),
        },
        {
          name: "chan_disputeTransfer malformed parameter transferId",
          overrides: { method: "chan_disputeTransfer", params: { transferId: invalidAddress } },
          error: malformedTransactionId,
        },

        {
          name: "chan_defundTransfer missing parameter transferId",
          overrides: { method: "chan_defundTransfer", params: { undefined } },
          error: missingParam("transferId"),
        },
        {
          name: "chan_defundTransfer malformed parameter transferId",
          overrides: { method: "chan_defundTransfer", params: { transferId: invalidAddress } },
          error: malformedTransactionId,
        },
        {
          name: "chan_subscription missing parameter subscription",
          overrides: { method: "chan_subscription", params: { data: "data" } },
          error: "Invalid method: subscription",
        },
        {
          name: "chan_subscription missing parameter data",
          overrides: { method: "chan_subscription", params: { subscription: invalidAddress } },
          error: "Invalid method: subscription",
        },
      ];

      for (const test of paramsTests) {
        it(test.name, async () => {
          const engine = await VectorEngine.connect(
            Sinon.createStubInstance(MemoryMessagingService),
            Sinon.createStubInstance(MemoryLockService),
            storeService,
            getRandomChannelSigner(),
            Sinon.createStubInstance(VectorChainService),
            chainAddresses,
            log,
          );
          let rpc: EngineParams.RpcRequest = { id: 1, jsonrpc: "2.0", ...test.overrides } as any;
          try {
            await engine.request(rpc);
          } catch (res) {
            expect(res.message).to.be.eq(test.error);
          }
        });
      }
    });
  });
});
