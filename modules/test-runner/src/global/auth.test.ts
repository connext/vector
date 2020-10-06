import {
  createTestChannelUpdate,
  expect,
  getBearerTokenFunction,
  getRandomChannelSigner,
  NatsMessagingService,
} from "@connext/vector-utils";
import axios from "axios";
import pino from "pino";

import { env } from "../utils";

describe("Global Auth Service", () => {
  const signer = getRandomChannelSigner();
  const userIdentifier = signer.publicIdentifier;

  it("should ping when we pong", async () => {
    const res = await axios.get(`${env.authUrl}/ping`);
    expect(res.data).to.equal("pong\n");
  });

  // TODO: this should fail if the authRes is invalid but it's still passing
  it("should dispense a jwt which allows the user to connect to NATS", async () => {
    const peer = getRandomChannelSigner();

    const messaging = new NatsMessagingService(
      { messagingUrl: env.natsUrl },
      pino(),
      getBearerTokenFunction(signer, env.authUrl),
    );
    await messaging.connect();

    const peerMessaging = new NatsMessagingService(
      { messagingUrl: env.natsUrl },
      pino(),
      getBearerTokenFunction(peer, env.authUrl),
    );
    await peerMessaging.connect();
    expect(peerMessaging).to.be.ok;

    const update = createTestChannelUpdate("setup", {
      fromIdentifier: userIdentifier,
      toIdentifier: getRandomChannelSigner().publicIdentifier,
    });

    const testSubject = `test.${userIdentifier}`;

    const received = new Promise((res, rej) => {
      peerMessaging.subscribe(testSubject, (event) => {
        res(event);
      });
      setTimeout(() => rej("Timeout"), 3000);
    });

    await expect(messaging.publish(testSubject, update)).to.be.fulfilled;
    console.log("msg sent, waiting to receive it");
    await expect(received).to.be.fulfilled;






  /*
    const nonceRes = await axios.get(`${env.authUrl}/auth/${userIdentifier}`);
    expect(nonceRes.status).to.equal(200);
    expect(nonceRes.data).to.be.a("string");

    const sig = await signer.signMessage(nonceRes.data);
    const authRes = await axios.post(`${env.authUrl}/auth`, { sig, userIdentifier });
    expect(authRes.status).to.equal(200);
    expect(nonceRes.data).to.be.a("string");

    await messaging.connect();
    expect(messaging).to.be.ok;

    const peerNonce = (await axios.get(`${env.authUrl}/auth/${peer.publicIdentifier}`)).data;
    const peerToken = (await axios.post(`${env.authUrl}/auth`, {
      sig: await peer.signMessage(peerNonce),
      userIdentifier: peer.publicIdentifier,
    })).data;

    const peerMessaging = new NatsMessagingService(
      { messagingUrl: env.natsUrl },
      pino(),
      () => Promise.resolve(peerToken),
    );
    await peerMessaging.connect();
    expect(peerMessaging).to.be.ok;

    const testSubject = `test.${userIdentifier}`;

    const received = new Promise((res, rej) => {
      peerMessaging.subscribe(testSubject, (event) => {
        res(event);
      });
      setTimeout(() => rej("Timeout"), 3000);
    });

    const update = createTestChannelUpdate("setup", {
      fromIdentifier: userIdentifier,
      toIdentifier: getRandomChannelSigner().publicIdentifier,
    });

    await expect(messaging.publish(testSubject, update)).to.be.fulfilled;
    console.log("msg sent, waiting to receive it");
    await expect(received).to.be.fulfilled;
*/

  });

});
