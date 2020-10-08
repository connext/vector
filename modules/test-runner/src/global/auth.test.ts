import {
  delay,
  NatsMessagingService,
  expect,
  getBearerTokenFunction,
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
    const res = await axios.get(`${env.authUrl}/ping`);
    expect(res.data).to.equal("pong\n");
  });

  it("should dispense a jwt which allows the user to connect to NATS", async () => {
    const opts = { messagingUrl: env.natsUrl };
    const nonceRes = await axios.get(`${env.authUrl}/auth/${recipientId}`);
    expect(nonceRes.status).to.equal(200);
    expect(nonceRes.data).to.be.a("string");
    const sig = await recipient.signMessage(nonceRes.data);
    const verifyRes = await axios.post(`${env.authUrl}/auth`, { sig, userIdentifier: recipientId });
    expect(verifyRes.status).to.equal(200);
    expect(verifyRes.data).to.be.a("string");

    const recipientMessaging = new NatsMessagingService(opts, pino(), () => verifyRes.data);
    expect(recipientMessaging).to.be.ok;
    await recipientMessaging.connect();

    const received = new Promise((res, rej) => {
      recipientMessaging.subscribe(testSubject, res);
      setTimeout(() => rej("Timeout"), 10002);
    });

    const senderMessaging = new NatsMessagingService(
      opts,
      pino(),
      getBearerTokenFunction(sender, env.authUrl),
    );
    expect(senderMessaging).to.be.ok;
    await senderMessaging.connect();

    const testSubject = `${senderId}.${recipientId}.test.subject`;

    console.log(`Waiting for message`);
    await delay(3000);

    console.log(`Sending message`);
    await expect(recipientMessaging.publish(testSubject, { hello: "world" })).to.be.fulfilled;
    await expect(received).to.be.fulfilled;

  });

});
