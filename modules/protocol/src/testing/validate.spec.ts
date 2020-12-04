import { VectorChainReader } from "@connext/vector-contracts";
import {
  ChannelSigner,
  createTestChannelUpdate,
  createTestChannelUpdateWithSigners,
  expect,
  getRandomChannelSigner,
} from "@connext/vector-utils";
import {
  ChannelUpdate,
  FullChannelState,
  FullTransferState,
  IExternalValidation,
  InboundChannelUpdateError,
  Result,
  UpdateType,
  Values,
} from "@connext/vector-types";
import Sinon from "sinon";

import * as vectorUtils from "../utils";
import * as validation from "../validate";
import * as vectorUpdate from "../update";

describe("validateUpdateParams", () => {});

describe("validateParamsAndApplyUpdate", () => {});

describe.only("validateAndApplyInboundUpdate", () => {
  // Test values
  let signers: ChannelSigner[];
  let previousState: FullChannelState;
  let update: ChannelUpdate;
  let activeTransfers: FullTransferState[];

  // Declare all mocks
  let chainReader: Sinon.SinonStubbedInstance<VectorChainReader>;
  let validateParamsAndApplyUpdateStub: Sinon.SinonStub;
  let validateChannelUpdateSignaturesStub: Sinon.SinonStub;
  let generateSignedChannelCommitmentStub: Sinon.SinonStub;
  let applyUpdateStub: Sinon.SinonStub;
  let externalValidationStub: IExternalValidation;

  // Create helper to run test
  const runErrorTest = async (
    setup: () => void, // should set any mocks/needed values
    errorMessage: Values<typeof InboundChannelUpdateError.reasons>,
    signer: ChannelSigner = signers[0],
    context: any = {},
  ) => {
    setup();
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
    expect(error?.state).to.be.deep.eq(previousState);
    expect(error?.context).to.containSubset(context);
    return;
  };

  beforeEach(() => {
    // Set test values
    signers = Array(2)
      .fill(0)
      .map((_) => getRandomChannelSigner());

    // Set mocks
    chainReader = Sinon.createStubInstance(VectorChainReader);
    validateParamsAndApplyUpdateStub = Sinon.stub(validation, "validateParamsAndApplyUpdate");
    validateChannelUpdateSignaturesStub = Sinon.stub(vectorUtils, "validateChannelUpdateSignatures");
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
            "should be equal to one of the allowed values,should be equal to one of the allowed values,should be equal to one of the allowed values,should be equal to one of the allowed values,should match exactly one schema in oneOf",
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
          error: "should have required property '.details'",
        },
        {
          name: "malformed aliceSignature",
          overrides: { aliceSignature: "fail" },
          error: 'should match pattern "^0x([a-fA-F0-9]{130})$"',
        },
        {
          name: "malformed bobSignature",
          overrides: { bobSignature: "fail" },
          error: 'should match pattern "^0x([a-fA-F0-9]{130})$"',
        },
      ];
      for (const test of tests) {
        it(test.name, async () => {
          const setup = () => {
            update = { ...valid, ...(test.overrides ?? {}) } as any;
          };
          await runErrorTest(setup, InboundChannelUpdateError.reasons.MalformedUpdate, signers[0], {
            error: test.error,
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
          const setup = () => {
            update = {
              ...valid,
              details: {
                ...valid.details,
                ...test.overrides,
              },
            };
          };
          await runErrorTest(setup, InboundChannelUpdateError.reasons.MalformedDetails, signers[0], {
            error: test.error,
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
          const setup = () => {
            update = {
              ...valid,
              details: {
                ...valid.details,
                ...test.overrides,
              },
            };
          };
          await runErrorTest(setup, InboundChannelUpdateError.reasons.MalformedDetails, signers[0], {
            error: test.error,
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
          const setup = () => {
            update = {
              ...valid,
              details: {
                ...valid.details,
                ...test.overrides,
              },
            };
          };
          await runErrorTest(setup, InboundChannelUpdateError.reasons.MalformedDetails, signers[0], {
            error: test.error,
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
          error: "should have required property 'transferResolver'",
        },
        {
          name: "malformed transferResolver",
          overrides: { transferResolver: "fail" },
          error: "should be object",
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
          const setup = () => {
            update = {
              ...valid,
              details: {
                ...valid.details,
                ...test.overrides,
              },
            };
          };
          await runErrorTest(setup, InboundChannelUpdateError.reasons.MalformedDetails, signers[0], {
            error: test.error,
          });
        });
      }
    });
  });
  describe("should handle double signed update", () => {
    it("should work without hitting validation for UpdateType.resolve", async () => {});
    it("should work without hitting validation for all other update types", async () => {});
    it("should fail if chainReader.resolve fails", async () => {});
    it("should fail if transfer is inactive", async () => {});
    it("should fail if applyUpdate fails", async () => {});
    it("should fail if validateChannelUpdateSignatures fails", async () => {});
  });
  it("should fail if update.nonce is not exactly one greater than previous", async () => {});
  it("should fail if validateParamsAndApplyUpdate fails", async () => {});
  it("should fail if single signed + invalid sig", async () => {});
  it("should fail if double signed + invalid sig", async () => {});
  it("should fail if generateSignedChannelCommitment fails", async () => {});
  it("should work for a single signed update", async () => {});
});
