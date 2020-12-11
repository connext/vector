import { Evt } from "evt";
import fastify from "fastify";
import pino from "pino";
import {
  ConditionalTransferCreatedPayload,
  ConditionalTransferResolvedPayload,
  DepositReconciledPayload,
  EngineEvents,
} from "@connext/vector-types";

import { env } from "../../utils";

const serverBase = `http://${env.testerName}:${env.port}`;
const conditionalTransferCreatedPath = "/conditional-transfer-created";
const conditionalTransferResolvedPath = "/conditional-transfer-resolved";
const depositReconciledPath = "/deposit-reconciled";

export const carolEvts = {
  [EngineEvents.SETUP]: {},
  [EngineEvents.WITHDRAWAL_CREATED]: {},
  [EngineEvents.WITHDRAWAL_RESOLVED]: {},
  [EngineEvents.WITHDRAWAL_RECONCILED]: {},
  [EngineEvents.REQUEST_COLLATERAL]: {},
  [EngineEvents.CONDITIONAL_TRANSFER_CREATED]: {
    evt: Evt.create<ConditionalTransferCreatedPayload>(),
    url: `${serverBase}${conditionalTransferCreatedPath}`,
  },
  [EngineEvents.CONDITIONAL_TRANSFER_RESOLVED]: {
    evt: Evt.create<ConditionalTransferResolvedPayload>(),
    url: `${serverBase}${conditionalTransferResolvedPath}`,
  },
  [EngineEvents.DEPOSIT_RECONCILED]: {
    evt: Evt.create<DepositReconciledPayload>(),
    url: `${serverBase}${depositReconciledPath}`,
  },
};

export const logger = pino({ level: "info" });
const server = fastify();

server.get("/ping", async () => {
  return "pong\n";
});

server.post(`${conditionalTransferCreatedPath}`, async (request, response) => {
  carolEvts[EngineEvents.CONDITIONAL_TRANSFER_CREATED].evt.post(request.body as ConditionalTransferCreatedPayload);
  return response.status(200).send({ message: "success" });
});

server.post(`${conditionalTransferResolvedPath}`, async (request, response) => {
  carolEvts[EngineEvents.CONDITIONAL_TRANSFER_RESOLVED].evt.post(request.body as ConditionalTransferResolvedPayload);
  return response.status(200).send({ message: "success" });
});

server.post(`${depositReconciledPath}`, async (request, response) => {
  carolEvts[EngineEvents.DEPOSIT_RECONCILED].evt.post(request.body as DepositReconciledPayload);
  return response.status(200).send({ message: "success" });
});

export const startServer = (): Promise<void> => {
  return new Promise((resolve) => {
    server.listen(env.port, "0.0.0.0", (err, address) => {
      if (err) {
        console.error(err);
        process.exit(1);
      }
      console.log(`Server listening at ${address}`);
      resolve();
    });
  });
};
