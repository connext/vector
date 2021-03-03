import { RestServerNodeService, expect, getRandomBytes32, delay } from "@connext/vector-utils";
import { EngineEvents, RouterSchemas, TransferNames, INodeService } from "@connext/vector-types";
import { Wallet, utils, providers, constants } from "ethers";
import pino from "pino";

import { env } from "../utils";

import { carolEvts, daveEvts } from "./eventSetup";

const chainId = parseInt(Object.keys(env.chainProviders)[0]);
const provider = new providers.JsonRpcProvider(env.chainProviders[chainId]);
const wallet = Wallet.fromMnemonic(env.sugarDaddy!).connect(provider);

const logger = pino({ level: env.logLevel });
const testName = "Trio Ping Pong";

// TODO: need to fix this test to work with the other test
describe.skip(testName, () => {
  let carolService: INodeService;
  let carolIdentifier: string;
  let carol: string;

  let daveService: INodeService;
  let daveIdentifier: string;
  let dave: string;

  let rogerService: INodeService;
  let rogerIdentifier: string;
  let roger: string;

  before(async () => {
    carolService = await RestServerNodeService.connect(
      env.carolUrl,
      logger.child({ testName, name: "Carl" }),
      carolEvts,
    );
    const carolConfigRes = await carolService.createNode({ index: 0 });
    expect(carolConfigRes.getError()).to.not.be.ok;
    const carolConfig = carolConfigRes.getValue();
    carolIdentifier = carolConfig.publicIdentifier;
    carol = carolConfig.signerAddress;
    const carolTx = await wallet.sendTransaction({ to: carol, value: utils.parseEther("0.1") });
    await carolTx.wait();

    daveService = await RestServerNodeService.connect(env.daveUrl, logger.child({ testName, name: "Dave" }), daveEvts);
    const daveConfigRes = await daveService.createNode({ index: 0 });
    expect(daveConfigRes.getError()).to.not.be.ok;
    const daveConfig = daveConfigRes.getValue();
    daveIdentifier = daveConfig.publicIdentifier;
    dave = daveConfig.signerAddress;
    const daveTx = await wallet.sendTransaction({ to: dave, value: utils.parseEther("0.1") });
    await daveTx.wait();

    rogerService = await RestServerNodeService.connect(env.rogerUrl, logger.child({ testName, name: "Roger" }));
    const rogerConfigRes = await rogerService.createNode({ index: 0 });
    expect(rogerConfigRes.getError()).to.not.be.ok;
    const rogerConfig = rogerConfigRes.getValue();
    rogerIdentifier = rogerConfig.publicIdentifier;
    roger = rogerConfig.signerAddress;
    const rogerTx = await wallet.sendTransaction({ to: roger, value: utils.parseEther("0.1") });
    await rogerTx.wait();
  });

  it("roger should setup channels with carol and dave", async () => {
    let channelRes = await carolService.setup({
      counterpartyIdentifier: rogerIdentifier,
      chainId,
      timeout: "360000",
    });
    let channel = channelRes.getValue();
    expect(channel.channelAddress).to.be.ok;
    const carolChannel = await carolService.getStateChannel({
      channelAddress: channel.channelAddress,
      publicIdentifier: carolIdentifier,
    });
    let rogerChannel = await rogerService.getStateChannel({
      channelAddress: channel.channelAddress,
      publicIdentifier: rogerIdentifier,
    });
    expect(carolChannel.getValue()).to.deep.eq(rogerChannel.getValue());

    channelRes = await daveService.setup({
      counterpartyIdentifier: rogerIdentifier,
      chainId,
      timeout: "360000",
    });
    channel = channelRes.getValue();
    expect(channel.channelAddress).to.be.ok;
    const daveChannel = await daveService.getStateChannel({
      channelAddress: channel.channelAddress,
      publicIdentifier: daveIdentifier,
    });
    rogerChannel = await rogerService.getStateChannel({
      channelAddress: channel.channelAddress,
      publicIdentifier: rogerIdentifier,
    });
    expect(daveChannel.getValue()).to.deep.eq(rogerChannel.getValue());
  });

  it("carol can transfer ETH back and forth", () => {
    return new Promise<void>(async (resolve) => {
      const assetId = constants.AddressZero;
      const depositAmt = utils.parseEther("0.25");
      const channelRes = await carolService.getStateChannelByParticipants({
        counterparty: rogerIdentifier,
        chainId,
        publicIdentifier: carolIdentifier,
      });
      const channel = channelRes.getValue()!;

      const tx = await wallet.sendTransaction({ to: channel.channelAddress, value: depositAmt });
      await tx.wait();

      const depositRes = await carolService.reconcileDeposit({
        assetId,
        channelAddress: channel.channelAddress,
        publicIdentifier: carolIdentifier,
      });
      const deposit = depositRes.getValue();

      expect(deposit.channelAddress).to.be.a("string");

      const NUM_PAYMENTS = 10;
      const preImages = {};

      const transferAmt = utils.parseEther("0.005");
      const carolChannelRes = await carolService.getStateChannelByParticipants({
        counterparty: rogerIdentifier,
        chainId,
        publicIdentifier: carolIdentifier,
      });
      const carolChannel = carolChannelRes.getValue()!;

      const daveChannelRes = await daveService.getStateChannelByParticipants({
        counterparty: rogerIdentifier,
        chainId,
        publicIdentifier: daveIdentifier,
      });
      const daveChannel = daveChannelRes.getValue()!;

      const preImage = getRandomBytes32();
      const lockHash = utils.soliditySha256(["bytes32"], [preImage]);
      const routingId = getRandomBytes32();
      preImages[routingId] = preImage;

      let paymentsReceived = 0;
      carolService.on(
        EngineEvents.CONDITIONAL_TRANSFER_CREATED,
        async (data) => {
          paymentsReceived += 1;
          logger.info(`Carol received transfer: ${data.transfer.meta?.routingId} NUM_PAYMENTS: ${paymentsReceived}`);
          if (paymentsReceived > NUM_PAYMENTS) {
            resolve();
          }
          // resolve transfer
          const routingId = (data.transfer.meta as RouterSchemas.RouterMeta).routingId;
          const preImage = preImages[routingId];
          await carolService.resolveTransfer({
            channelAddress: carolChannel.channelAddress,
            transferResolver: {
              preImage,
            },
            transferId: data.transfer.transferId,
            publicIdentifier: carolIdentifier,
          });
          await delay(5000);

          // send transfer back
          const newPreImage = getRandomBytes32();
          const lockHash = utils.soliditySha256(["bytes32"], [newPreImage]);
          const newRoutingId = getRandomBytes32();
          preImages[newRoutingId] = newPreImage;

          const transferRes = await carolService.conditionalTransfer({
            amount: transferAmt.toString(),
            assetId,
            channelAddress: carolChannel.channelAddress,
            type: TransferNames.HashlockTransfer,
            details: {
              lockHash,
              expiry: "0",
            },
            meta: {
              routingId: newRoutingId,
            },
            recipient: daveIdentifier,
            publicIdentifier: carolIdentifier,
          });
          expect(transferRes.getError()).to.not.be.ok;
          logger.info(`Carol sent transfer to Dave: ${newRoutingId}`);
        },
        (data) => data.transfer.initiator !== carol,
      );

      daveService.on(
        EngineEvents.CONDITIONAL_TRANSFER_CREATED,
        async (data) => {
          logger.info(`Dave received transfer: ${data.transfer.meta?.routingId}`);
          // resolve transfer
          const routingId = (data.transfer.meta as RouterSchemas.RouterMeta).routingId;
          const preImage = preImages[routingId];
          await daveService.resolveTransfer({
            publicIdentifier: daveIdentifier,
            channelAddress: daveChannel.channelAddress,
            transferResolver: {
              preImage,
            },
            transferId: data.transfer.transferId,
          });
          await delay(5000);

          // send transfer back
          const newPreImage = getRandomBytes32();
          const lockHash = utils.soliditySha256(["bytes32"], [newPreImage]);
          const newRoutingId = getRandomBytes32();
          preImages[newRoutingId] = newPreImage;

          const transferRes = await daveService.conditionalTransfer({
            publicIdentifier: daveIdentifier,
            amount: transferAmt.toString(),
            assetId,
            channelAddress: daveChannel.channelAddress,
            type: TransferNames.HashlockTransfer,
            details: {
              lockHash,
              expiry: "0",
            },
            meta: {
              routingId: newRoutingId,
            },
            recipient: carolIdentifier,
          });
          expect(transferRes.getError()).to.not.be.ok;
          logger.info(`Dave sent transfer to Carol: ${newRoutingId}`);
        },
        (data) => data.transfer.initiator !== dave,
      );

      const transferRes = await carolService.conditionalTransfer({
        publicIdentifier: carolIdentifier,
        amount: transferAmt.toString(),
        assetId,
        channelAddress: carolChannel.channelAddress,
        type: TransferNames.HashlockTransfer,
        details: {
          lockHash,
          expiry: "0",
        },
        meta: {
          routingId,
        },
        recipient: daveIdentifier,
      });
      expect(transferRes.getError()).to.not.be.ok;
    });
  });
});
