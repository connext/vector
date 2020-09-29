import { WithdrawCommitment } from "@connext/vector-contracts";
import {
  ChainAddresses,
  ChannelUpdateEvent,
  FullTransferState,
  IChannelSigner,
  ProtocolEventName,
  ProtocolEventPayloadsMap,
  Result,
  UpdateType,
  WithdrawalCreatedPayload,
  WITHDRAWAL_CREATED_EVENT,
  WithdrawCommitmentJson,
  WithdrawResolver,
  WithdrawResolverEncoding,
  WithdrawState,
  WithdrawStateEncoding,
} from "@connext/vector-types";
import {
  createTestChannelState,
  getTestLoggers,
  getRandomChannelSigner,
  mkAddress,
  expect,
  delay,
  MemoryStoreService,
  createTestChannelStateWithSigners,
} from "@connext/vector-utils";
import { Vector } from "@connext/vector-protocol";
import { BigNumber, utils } from "ethers";
import { Evt } from "evt";
import Sinon from "sinon";

import { setupEngineListeners } from "../listeners";
import { getEngineEvtContainer } from "../utils";

import { env } from "./env";

const { hexlify, randomBytes } = utils;

const testName = "Engine listeners unit";
const { log } = getTestLoggers(testName, env.logLevel);

describe(testName, () => {
  // Get env constants
  const chainId = parseInt(Object.keys(env.chainProviders)[0]);
  const withdrawDefinition = env.contractAddresses[chainId].Withdraw.address;
  const chainAddresses: ChainAddresses = {
    [chainId]: {
      withdrawDefinition,
      channelFactoryAddress: env.contractAddresses[chainId].ChannelFactory.address,
      channelMastercopyAddress: env.contractAddresses[chainId].ChannelMastercopy.address,
      linkedTransferDefinition: env.contractAddresses[chainId].LinkedTransfer.address,
    },
  };

  // Get test constants
  const alice: IChannelSigner = getRandomChannelSigner();
  const bob: IChannelSigner = getRandomChannelSigner();
  const messaging = {} as any;
  const container = getEngineEvtContainer();

  // Declare mocks
  let store: Sinon.SinonStubbedInstance<MemoryStoreService>;

  // Create an EVT to post to, that can be aliased as a
  // vector instance
  const evt = Evt.create<ChannelUpdateEvent>();
  // Set vector stub to interact with this EVT instance
  const on = (
    event: ProtocolEventName,
    callback: (payload: ProtocolEventPayloadsMap[typeof event]) => void | Promise<void>,
    filter: (payload) => boolean = _payload => true,
  ) => evt.pipe(filter).attach(callback);

  let vector: Sinon.SinonStubbedInstance<Vector>;

  beforeEach(() => {
    // Create the mocked instances
    store = Sinon.createStubInstance(MemoryStoreService);

    vector = Sinon.createStubInstance(Vector);
    vector.on = on as any;
  });

  afterEach(() => Sinon.restore());

  describe("withdraw", () => {
    // Generate withdrawal test constants
    const getWithdrawalCommitment = async (
      overrides: Partial<WithdrawCommitmentJson> = {},
    ): Promise<{ state: WithdrawState; resolver: WithdrawResolver; commitment: WithdrawCommitmentJson }> => {
      // Generate commitment
      const fee = BigNumber.from(3);
      const withdrawalAmount = BigNumber.from(4);
      const commitment = await WithdrawCommitment.fromJson({
        channelAddress: mkAddress("0xccc"),
        initiator: alice.address,
        responder: bob.address,
        recipient: alice.address,
        assetId: mkAddress(),
        amount: withdrawalAmount.toString(),
        nonce: "1",
        ...overrides,
      });
      // Generate signatures
      const initiatorSignature = await alice.signMessage(commitment.hashToSign());
      const responderSignature = await bob.signMessage(commitment.hashToSign());
      // Generate state
      const state: WithdrawState = {
        balance: {
          to: [commitment.recipient, commitment.responder],
          amount: [fee.add(commitment.amount).toString(), "0"],
        },
        nonce: commitment.nonce,
        initiatorSignature,
        responder: commitment.responder,
        initiator: commitment.initiator,
        data: hexlify(randomBytes(32)),
        fee: fee.toString(),
      };
      return { resolver: { responderSignature }, state, commitment: commitment.toJson() };
    };

    it("should work for eth, recipient in channel", async () => {
      await setupEngineListeners(container, vector, messaging, bob, store, chainAddresses, log);

      const { state, resolver, commitment } = await getWithdrawalCommitment();

      const updatedChannelState = createTestChannelStateWithSigners([alice, bob], UpdateType.create, {
        channelAddress: mkAddress("0xccc"),
        latestUpdate: {
          assetId: mkAddress(),
          toIdentifier: bob.publicIdentifier,
          details: {
            transferDefinition: withdrawDefinition,
            transferInitialState: { ...state },
            transferEncodings: [WithdrawStateEncoding, WithdrawResolverEncoding],
            responder: commitment.responder,
          },
        },
        assetIds: [commitment.assetId],
        networkContext: {
          withdrawDefinition,
          chainId,
        },
      });

      // Set the resolve mock to return a result
      vector.resolve.resolves(
        Result.ok(
          createTestChannelState(UpdateType.resolve, {
            latestUpdate: {
              fromIdentifier: bob.publicIdentifier,
            },
          }),
        ),
      );

      // transfer should be stored
      const transfer = {} as FullTransferState;
      store.getTransferState.resolves(transfer);

      const createdEvent = new Promise<WithdrawalCreatedPayload>(resolve =>
        container[WITHDRAWAL_CREATED_EVENT].attachOnce(5000, resolve),
      );

      // Post to the evt
      evt.post({ updatedChannelState });
      const emitted = await createdEvent;
      // wait for handler
      await delay(500);

      // Verify the emitted event
      expect(emitted).to.containSubset({
        assetId: commitment.assetId,
        amount: commitment.amount,
        recipient: alice.address,
        fee: state.fee,
        transfer,
        channelBalance:
          updatedChannelState.balances[updatedChannelState.assetIds.findIndex(a => a === commitment.assetId)],
        channelAddress: updatedChannelState.channelAddress,
      });

      // Verify the double signed commitment was stored
      expect(store.saveWithdrawalCommitment.callCount).to.be.eq(1);
      const [storeTransferId, withdrawCommitment] = store.saveWithdrawalCommitment.args[0];
      expect(storeTransferId).to.be.eq(updatedChannelState.latestUpdate.details.transferId);
      expect(withdrawCommitment.initiatorSignature).to.be.ok;
      expect(withdrawCommitment.responderSignature).to.be.ok;

      // Verify that resolve was called correctly
      expect(vector.resolve.callCount).to.be.eq(1);
      const { transferResolver, channelAddress, transferId } = vector.resolve.args[0][0];
      expect(transferResolver).to.be.deep.eq(resolver);
      expect(channelAddress).to.be.eq(updatedChannelState.channelAddress);
      expect(transferId).to.be.eq(updatedChannelState.latestUpdate.details.transferId);
    });
  });
});
