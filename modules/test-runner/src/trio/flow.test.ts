import { EngineEvents, RouterSchemas } from "@connext/vector-types";
import { IServerNodeService, RestServerNodeService, expect, getRandomBytes32, delay } from "@connext/vector-utils";
import { Wallet, utils, providers, constants } from "ethers";
import pino from "pino";

import { env } from "../utils";

import { carolEvts, daveEvts } from "./setup";

const chainId = parseInt(Object.keys(env.chainProviders)[0]);
const provider = new providers.JsonRpcProvider(env.chainProviders[chainId]);
const wallet = Wallet.fromMnemonic(env.sugarDaddy!).connect(provider);

const logger = pino({ level: env.logLevel });
const testName = "Trio Ping Pong";

describe.only(testName, () => {
  let carol: IServerNodeService;
  let dave: IServerNodeService;
  let roger: IServerNodeService;

  before(async () => {
    carol = await RestServerNodeService.connect(
      env.carolUrl,
      env.chainProviders,
      logger.child({ testName, name: "Carl" }),
      carolEvts,
    );
    expect(carol.signerAddress).to.be.a("string");
    expect(carol.publicIdentifier).to.be.a("string");

    dave = await RestServerNodeService.connect(
      env.daveUrl,
      env.chainProviders,
      logger.child({ testName, name: "Dave" }),
      daveEvts,
    );
    expect(dave.signerAddress).to.be.a("string");
    expect(dave.publicIdentifier).to.be.a("string");

    roger = await RestServerNodeService.connect(
      env.rogerUrl,
      env.chainProviders,
      logger.child({ testName, name: "Roger" }),
    );
    expect(roger.signerAddress).to.be.a("string");
    expect(roger.publicIdentifier).to.be.a("string");

    let tx = await wallet.sendTransaction({ to: carol.signerAddress, value: utils.parseEther("0.5") });
    await tx.wait();
    tx = await wallet.sendTransaction({ to: dave.signerAddress, value: utils.parseEther("0.5") });
    await tx.wait();
    tx = await wallet.sendTransaction({ to: roger.signerAddress, value: utils.parseEther("0.5") });
    await tx.wait();
  });

  it.skip("roger should setup channels with carol and dave", async () => {
    let channelRes = await roger.setup({
      chainId,
      counterpartyIdentifier: carol.publicIdentifier,
      timeout: "10000",
    });
    let channel = channelRes.getValue();
    expect(channel.channelAddress).to.be.ok;
    const carolChannel = await carol.getStateChannel({ channelAddress: channel.channelAddress });
    let rogerChannel = await roger.getStateChannel({ channelAddress: channel.channelAddress });
    expect(carolChannel.getValue()).to.deep.eq(rogerChannel.getValue());

    channelRes = await roger.setup({
      chainId,
      counterpartyIdentifier: dave.publicIdentifier,
      timeout: "10000",
    });
    channel = channelRes.getValue();
    expect(channel.channelAddress).to.be.ok;
    const daveChannel = await dave.getStateChannel({ channelAddress: channel.channelAddress });
    rogerChannel = await roger.getStateChannel({ channelAddress: channel.channelAddress });
    expect(daveChannel.getValue()).to.deep.eq(rogerChannel.getValue());
  });

  it("carol can transfer ETH back and forth", () => {
    return new Promise(async resolve => {
      const assetId = constants.AddressZero;
      const depositAmt = utils.parseEther("0.25");
      const channelRes = await carol.getStateChannelByParticipants({
        alice: roger.publicIdentifier,
        bob: carol.publicIdentifier,
        chainId,
      });
      const channel = channelRes.getValue()!;

      const depositRes = await carol.deposit({
        chainId: channel.networkContext.chainId,
        amount: depositAmt.toString(),
        assetId,
        channelAddress: channel.channelAddress,
      });
      const deposit = depositRes.getValue();

      expect(deposit.channelAddress).to.be.a("string");

      const NUM_PAYMENTS = 10;
      const preImages = {};

      const transferAmt = utils.parseEther("0.005");
      const carolChannelRes = await carol.getStateChannelByParticipants({
        alice: roger.publicIdentifier,
        bob: carol.publicIdentifier,
        chainId,
      });
      const carolChannel = carolChannelRes.getValue()!;

      const daveChannelRes = await dave.getStateChannelByParticipants({
        alice: roger.publicIdentifier,
        bob: dave.publicIdentifier,
        chainId,
      });
      const daveChannel = daveChannelRes.getValue()!;

      const preImage = getRandomBytes32();
      const linkedHash = utils.soliditySha256(["bytes32"], [preImage]);
      const routingId = getRandomBytes32();
      preImages[routingId] = preImage;

      let paymentsReceived = 0;
      await carol.on(
        EngineEvents.CONDITIONAL_TRANSFER_CREATED,
        async data => {
          paymentsReceived += 1;
          console.log(`Carol received transfer: ${data.transfer.meta?.routingId} NUM_PAYMENTS: ${paymentsReceived}`);
          if (paymentsReceived > NUM_PAYMENTS) {
            resolve();
          }
          // resolve transfer
          const routingId = (data.transfer.meta as RouterSchemas.RouterMeta).routingId;
          const preImage = preImages[routingId];
          await carol.resolveTransfer({
            channelAddress: carolChannel.channelAddress,
            conditionType: "LinkedTransfer",
            details: {
              preImage,
            },
            transferId: data.transfer.transferId,
          });
          await delay(5000);

          // send transfer back
          const newPreImage = getRandomBytes32();
          const linkedHash = utils.soliditySha256(["bytes32"], [preImage]);
          const newRoutingId = getRandomBytes32();
          preImages[newRoutingId] = newPreImage;

          const transferRes = await carol.conditionalTransfer({
            amount: transferAmt.toString(),
            assetId,
            channelAddress: carolChannel.channelAddress,
            conditionType: "LinkedTransfer",
            details: {
              linkedHash,
            },
            meta: {
              routingId: newRoutingId,
            },
            recipient: dave.publicIdentifier,
          });
          expect(transferRes.getError()).to.not.be.ok;
          console.log(`Carol sent transfer to Dave: ${newRoutingId}`);
        },
        data => data.transfer.initiator !== carol.signerAddress,
      );

      await dave.on(
        EngineEvents.CONDITIONAL_TRANSFER_CREATED,
        async data => {
          console.log(`Dave received transfer: ${data.transfer.meta?.routingId}`);
          // resolve transfer
          const routingId = (data.transfer.meta as RouterSchemas.RouterMeta).routingId;
          const preImage = preImages[routingId];
          await dave.resolveTransfer({
            channelAddress: daveChannel.channelAddress,
            conditionType: "LinkedTransfer",
            details: {
              preImage,
            },
            transferId: data.transfer.transferId,
          });
          await dave.getStateChannel({ channelAddress: daveChannel.channelAddress });
          await delay(5000);

          // send transfer back
          const newPreImage = getRandomBytes32();
          const linkedHash = utils.soliditySha256(["bytes32"], [preImage]);
          const newRoutingId = getRandomBytes32();
          preImages[newRoutingId] = newPreImage;

          const transferRes = await dave.conditionalTransfer({
            amount: transferAmt.toString(),
            assetId,
            channelAddress: daveChannel.channelAddress,
            conditionType: "LinkedTransfer",
            details: {
              linkedHash,
            },
            meta: {
              routingId: newRoutingId,
            },
            recipient: carol.publicIdentifier,
          });
          expect(transferRes.getError()).to.not.be.ok;
          console.log(`Dave sent transfer to Carol: ${newRoutingId}`);
        },
        data => data.transfer.initiator !== dave.signerAddress,
      );

      const transferRes = await carol.conditionalTransfer({
        amount: transferAmt.toString(),
        assetId,
        channelAddress: carolChannel.channelAddress,
        conditionType: "LinkedTransfer",
        details: {
          linkedHash,
        },
        meta: {
          routingId,
        },
        recipient: dave.publicIdentifier,
      });
      expect(transferRes.getError()).to.not.be.ok;
    });
  });
});
