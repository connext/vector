import {
  NatsMessagingService,
  expect,
  getRandomChannelSigner,
} from "@connext/vector-utils";
import axios from "axios";
import pino from "pino";

import { env } from "../utils";

describe("Global Auth Service", () => {
  const recipient = getRandomChannelSigner();
  const recipientId = recipient.publicIdentifier;
  const sender = getRandomChannelSigner();
  const senderId = sender.publicIdentifier;

  it("should pong when we ping", async () => {
    const res = await axios.get(`${env.messagingUrl}/ping`);
    expect(res.data).to.equal("pong\n");
  });

  it("should dispense a jwt which allows the user to connect to NATS", async () => {
    const testSubject = `${recipientId}.${senderId}.test.subject`;

    const nonceRes = await axios.get(`${env.messagingUrl}/auth/${recipientId}`);
    expect(nonceRes.status).to.equal(200);
    expect(nonceRes.data).to.be.a("string");

    const sig = await recipient.signMessage(nonceRes.data);
    const verifyRes = await axios.post(`${env.messagingUrl}/auth`, {
      sig,
      userIdentifier: recipientId,
    });
    expect(verifyRes.status).to.equal(200);
    expect(verifyRes.data).to.be.a("string");

    const recipientMessaging = new NatsMessagingService({
      bearerToken: verifyRes.data,
      logger: pino(),
      messagingUrl: env.messagingUrl,
    });
    await recipientMessaging.connect();

    const received = new Promise((res, rej) => {
      recipientMessaging.subscribe(testSubject, res);
      setTimeout(() => rej("Timeout"), 10002);
    });

    const senderMessaging = new NatsMessagingService({
      logger: pino(),
      messagingUrl: env.messagingUrl,
      signer: sender,
    });
    await senderMessaging.connect();

    await expect(senderMessaging.publish(testSubject, { hello: "world" })).to.be.fulfilled;
    await expect(received).to.be.fulfilled;
  });

});
