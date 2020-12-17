import { Evt } from "evt";
import fastify from "fastify";
import {
  ConditionalTransferCreatedPayload,
  ConditionalTransferResolvedPayload,
  DepositReconciledPayload,
  EngineEvents,
  WithdrawalCreatedPayload,
  WithdrawalReconciledPayload,
  WithdrawalResolvedPayload,
} from "@connext/vector-types";

import { env } from "../utils";

const serverBase = `http://${env.testerName}:${env.port}`;
const conditionalTransferCreatedPath = "/conditional-transfer-created";
const conditionalTransferResolvedPath = "/conditional-transfer-resolved";
const depositReconciledPath = "/deposit-reconciled";
const withdrawalCreatedPath = "/withdrawal-created";
const withdrawalResolvedPath = "/withdrawal-resolved";
const withdrawalReconciledPath = "/withdrawal-reconciled";
export const aliceEvts = {
  [EngineEvents.SETUP]: {},
  [EngineEvents.WITHDRAWAL_CREATED]: {
    evt: Evt.create<WithdrawalCreatedPayload>(),
    url: `${serverBase}${withdrawalCreatedPath}-alice`,
  },
  [EngineEvents.WITHDRAWAL_RESOLVED]: {
    evt: Evt.create<WithdrawalResolvedPayload>(),
    url: `${serverBase}${withdrawalResolvedPath}-alice`,
  },
  [EngineEvents.WITHDRAWAL_RECONCILED]: {
    evt: Evt.create<WithdrawalReconciledPayload>(),
    url: `${serverBase}${withdrawalReconciledPath}-alice`,
  },
  [EngineEvents.REQUEST_COLLATERAL]: {},
  [EngineEvents.CONDITIONAL_TRANSFER_CREATED]: {
    evt: Evt.create<ConditionalTransferCreatedPayload>(),
    url: `${serverBase}${conditionalTransferCreatedPath}-alice`,
  },
  [EngineEvents.CONDITIONAL_TRANSFER_RESOLVED]: {
    evt: Evt.create<ConditionalTransferResolvedPayload>(),
    url: `${serverBase}${conditionalTransferResolvedPath}-alice`,
  },
  [EngineEvents.DEPOSIT_RECONCILED]: {
    evt: Evt.create<DepositReconciledPayload>(),
    url: `${serverBase}${depositReconciledPath}-alice`,
  },
};

export const bobEvts = {
  [EngineEvents.SETUP]: {},
  [EngineEvents.WITHDRAWAL_CREATED]: {
    evt: Evt.create<WithdrawalCreatedPayload>(),
    url: `${serverBase}${withdrawalCreatedPath}-bob`,
  },
  [EngineEvents.WITHDRAWAL_RESOLVED]: {
    evt: Evt.create<WithdrawalResolvedPayload>(),
    url: `${serverBase}${withdrawalResolvedPath}-bob`,
  },
  [EngineEvents.WITHDRAWAL_RECONCILED]: {
    evt: Evt.create<WithdrawalReconciledPayload>(),
    url: `${serverBase}${withdrawalReconciledPath}-bob`,
  },
  [EngineEvents.REQUEST_COLLATERAL]: {},
  [EngineEvents.CONDITIONAL_TRANSFER_CREATED]: {
    evt: Evt.create<ConditionalTransferCreatedPayload>(),
    url: `${serverBase}${conditionalTransferCreatedPath}-bob`,
  },
  [EngineEvents.CONDITIONAL_TRANSFER_RESOLVED]: {
    evt: Evt.create<ConditionalTransferResolvedPayload>(),
    url: `${serverBase}${conditionalTransferResolvedPath}-bob`,
  },
  [EngineEvents.DEPOSIT_RECONCILED]: {
    evt: Evt.create<DepositReconciledPayload>(),
    url: `${serverBase}${depositReconciledPath}-bob`,
  },
};

const server = fastify();

server.get("/ping", async () => {
  return "pong\n";
});

server.post(`${conditionalTransferCreatedPath}-alice`, async (request, response) => {
  aliceEvts[EngineEvents.CONDITIONAL_TRANSFER_CREATED].evt.post(request.body as ConditionalTransferCreatedPayload);
  return response.status(200).send({ message: "success" });
});

server.post(`${conditionalTransferResolvedPath}-alice`, async (request, response) => {
  aliceEvts[EngineEvents.CONDITIONAL_TRANSFER_RESOLVED].evt.post(request.body as ConditionalTransferResolvedPayload);
  return response.status(200).send({ message: "success" });
});

server.post(`${depositReconciledPath}-alice`, async (request, response) => {
  aliceEvts[EngineEvents.DEPOSIT_RECONCILED].evt.post(request.body as DepositReconciledPayload);
  return response.status(200).send({ message: "success" });
});

server.post(`${withdrawalCreatedPath}-alice`, async (request, response) => {
  aliceEvts[EngineEvents.WITHDRAWAL_CREATED].evt.post(request.body as WithdrawalCreatedPayload);
  return response.status(200).send({ message: "success" });
});

server.post(`${withdrawalResolvedPath}-alice`, async (request, response) => {
  aliceEvts[EngineEvents.WITHDRAWAL_RESOLVED].evt.post(request.body as WithdrawalResolvedPayload);
  return response.status(200).send({ message: "success" });
});

server.post(`${withdrawalReconciledPath}-alice`, async (request, response) => {
  aliceEvts[EngineEvents.WITHDRAWAL_RECONCILED].evt.post(request.body as WithdrawalReconciledPayload);
  return response.status(200).send({ message: "success" });
});

server.post(`${conditionalTransferCreatedPath}-bob`, async (request, response) => {
  bobEvts[EngineEvents.CONDITIONAL_TRANSFER_CREATED].evt.post(request.body as ConditionalTransferCreatedPayload);
  return response.status(200).send({ message: "success" });
});

server.post(`${conditionalTransferResolvedPath}-bob`, async (request, response) => {
  bobEvts[EngineEvents.CONDITIONAL_TRANSFER_RESOLVED].evt.post(request.body as ConditionalTransferResolvedPayload);
  return response.status(200).send({ message: "success" });
});

server.post(`${depositReconciledPath}-bob`, async (request, response) => {
  bobEvts[EngineEvents.DEPOSIT_RECONCILED].evt.post(request.body as DepositReconciledPayload);
  return response.status(200).send({ message: "success" });
});

server.post(`${withdrawalCreatedPath}-bob`, async (request, response) => {
  bobEvts[EngineEvents.WITHDRAWAL_CREATED].evt.post(request.body as WithdrawalCreatedPayload);
  return response.status(200).send({ message: "success" });
});

server.post(`${withdrawalResolvedPath}-bob`, async (request, response) => {
  bobEvts[EngineEvents.WITHDRAWAL_RESOLVED].evt.post(request.body as WithdrawalResolvedPayload);
  return response.status(200).send({ message: "success" });
});

server.post(`${withdrawalReconciledPath}-bob`, async (request, response) => {
  bobEvts[EngineEvents.WITHDRAWAL_RECONCILED].evt.post(request.body as WithdrawalReconciledPayload);
  return response.status(200).send({ message: "success" });
});

server.listen(env.port, "0.0.0.0", (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server listening at ${address}`);
});
