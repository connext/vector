import {
  getBearerTokenFunction,
  NatsMessagingService,
} from "@connext/vector-messaging";
import {
  expect,
  getRandomChannelSigner,
} from "@connext/vector-utils";
import axios from "axios";
import pino from "pino";

import { env } from "../utils";

describe("Global Auth Service", () => {
  const alice = getRandomChannelSigner();
  const bob = getRandomChannelSigner();
  const aliceId = alice.publicIdentifier;
  const bobId = bob.publicIdentifier;

  it("should pong when we ping", async () => {
    const res = await axios.get(`${env.authUrl}/ping`);
    expect(res.data).to.equal("pong\n");
  });

  it("should dispense a jwt which allows the user to connect to NATS", async () => {
    const opts = { messagingUrl: env.natsUrl };

    const nonceRes = await axios.get(`${env.authUrl}/auth/${aliceId}`);
    expect(nonceRes.status).to.equal(200);
    expect(nonceRes.data).to.be.a("string");

    const sig = await alice.signMessage(nonceRes.data);
    const authRes = await axios.post(`${env.authUrl}/auth`, { sig, userIdentifier: aliceId });
    expect(authRes.status).to.equal(200);
    expect(nonceRes.data).to.be.a("string");

    const aliceMessaging = new NatsMessagingService(opts, pino(), () => authRes.data);
    expect(aliceMessaging).to.be.ok;
    await aliceMessaging.connect();

    const bobMessaging = new NatsMessagingService(
      opts,
      pino(),
      getBearerTokenFunction(bob, env.authUrl),
    );
    expect(bobMessaging).to.be.ok;
    await bobMessaging.connect();

    const testSubject = `${bobId}.${aliceId}.test.subject`;

    const received = new Promise((res, rej) => {
      bobMessaging.subscribe(testSubject, (event) => {
        res(event);
      });
      setTimeout(() => rej("Timeout"), 10002);
    });

    await expect(aliceMessaging.publish(testSubject, { hello: "world" })).to.be.fulfilled;
    await expect(received).to.be.fulfilled;

  });

});
