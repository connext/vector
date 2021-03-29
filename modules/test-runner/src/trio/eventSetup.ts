import { Evt } from "evt";
import fastify from "fastify";
import {
  ConditionalTransferCreatedPayload,
  ConditionalTransferResolvedPayload,
  DepositReconciledPayload,
  EngineEvents,
  ChainServiceEvents,
  WithdrawalCreatedPayload,
  WithdrawalReconciledPayload,
  WithdrawalResolvedPayload,
  ChannelDisputedPayload,
} from "@connext/vector-types";

import { env } from "../utils";

const serverBase = `http://${env.testerName}:${env.port}`;
const conditionalTransferCreatedPath = "/conditional-transfer-created";
const conditionalTransferResolvedPath = "/conditional-transfer-resolved";
const depositReconciledPath = "/deposit-reconciled";
const withdrawalCreatedPath = "/withdrawal-created";
const withdrawalResolvedPath = "/withdrawal-resolved";
const withdrawalReconciledPath = "/withdrawal-reconciled";
const channelDisputedPath = "/channel-disputed";
export const carolEvts = {
  [EngineEvents.IS_ALIVE]: {},
  [EngineEvents.SETUP]: {},
  [EngineEvents.WITHDRAWAL_CREATED]: {
    evt: Evt.create<WithdrawalCreatedPayload>(),
    url: `${serverBase}${withdrawalCreatedPath}-carol`,
  },
  [EngineEvents.WITHDRAWAL_RESOLVED]: {
    evt: Evt.create<WithdrawalResolvedPayload>(),
    url: `${serverBase}${withdrawalResolvedPath}-carol`,
  },
  [EngineEvents.WITHDRAWAL_RECONCILED]: {
    evt: Evt.create<WithdrawalReconciledPayload>(),
    url: `${serverBase}${withdrawalReconciledPath}-carol`,
  },
  [EngineEvents.REQUEST_COLLATERAL]: {},
  [EngineEvents.RESTORE_STATE_EVENT]: {},
  [EngineEvents.CONDITIONAL_TRANSFER_CREATED]: {
    evt: Evt.create<ConditionalTransferCreatedPayload>(),
    url: `${serverBase}${conditionalTransferCreatedPath}-carol`,
  },
  [EngineEvents.CONDITIONAL_TRANSFER_RESOLVED]: {
    evt: Evt.create<ConditionalTransferResolvedPayload>(),
    url: `${serverBase}${conditionalTransferResolvedPath}-carol`,
  },
  [EngineEvents.DEPOSIT_RECONCILED]: {
    evt: Evt.create<DepositReconciledPayload>(),
    url: `${serverBase}${depositReconciledPath}-carol`,
  },
  [ChainServiceEvents.TRANSACTION_SUBMITTED]: {},
  [ChainServiceEvents.TRANSACTION_MINED]: {},
  [ChainServiceEvents.TRANSACTION_FAILED]: {},
  [EngineEvents.CHANNEL_DISPUTED]: {
    evt: Evt.create<ChannelDisputedPayload & { publicIdentifier: string }>(),
    url: `${serverBase}${channelDisputedPath}-carol`,
  },
  [EngineEvents.CHANNEL_DEFUNDED]: {},
  [EngineEvents.TRANSFER_DISPUTED]: {},
  [EngineEvents.TRANSFER_DEFUNDED]: {},
};

export const daveEvts = {
  [EngineEvents.IS_ALIVE]: {},
  [EngineEvents.SETUP]: {},
  [EngineEvents.WITHDRAWAL_CREATED]: {
    evt: Evt.create<WithdrawalCreatedPayload>(),
    url: `${serverBase}${withdrawalCreatedPath}-dave`,
  },
  [EngineEvents.WITHDRAWAL_RESOLVED]: {
    evt: Evt.create<WithdrawalResolvedPayload>(),
    url: `${serverBase}${withdrawalResolvedPath}-dave`,
  },
  [EngineEvents.WITHDRAWAL_RECONCILED]: {
    evt: Evt.create<WithdrawalReconciledPayload>(),
    url: `${serverBase}${withdrawalReconciledPath}-dave`,
  },
  [EngineEvents.REQUEST_COLLATERAL]: {},
  [EngineEvents.RESTORE_STATE_EVENT]: {},
  [EngineEvents.CONDITIONAL_TRANSFER_CREATED]: {
    evt: Evt.create<ConditionalTransferCreatedPayload>(),
    url: `${serverBase}${conditionalTransferCreatedPath}-dave`,
  },
  [EngineEvents.CONDITIONAL_TRANSFER_RESOLVED]: {
    evt: Evt.create<ConditionalTransferResolvedPayload>(),
    url: `${serverBase}${conditionalTransferResolvedPath}-dave`,
  },
  [EngineEvents.DEPOSIT_RECONCILED]: {
    evt: Evt.create<DepositReconciledPayload>(),
    url: `${serverBase}${depositReconciledPath}-dave`,
  },
  [ChainServiceEvents.TRANSACTION_SUBMITTED]: {},
  [ChainServiceEvents.TRANSACTION_MINED]: {},
  [ChainServiceEvents.TRANSACTION_FAILED]: {},
  [EngineEvents.CHANNEL_DISPUTED]: {
    evt: Evt.create<ChannelDisputedPayload & { publicIdentifier: string }>(),
    url: `${serverBase}${channelDisputedPath}-dave`,
  },
  [EngineEvents.CHANNEL_DEFUNDED]: {},
  [EngineEvents.TRANSFER_DISPUTED]: {},
  [EngineEvents.TRANSFER_DEFUNDED]: {},
};

const server = fastify();

server.get("/ping", async () => {
  return "pong\n";
});

server.post(`${conditionalTransferCreatedPath}-carol`, async (request, response) => {
  carolEvts[EngineEvents.CONDITIONAL_TRANSFER_CREATED].evt.post(request.body as ConditionalTransferCreatedPayload);
  return response.status(200).send({ message: "success" });
});

server.post(`${conditionalTransferResolvedPath}-carol`, async (request, response) => {
  carolEvts[EngineEvents.CONDITIONAL_TRANSFER_RESOLVED].evt.post(request.body as ConditionalTransferResolvedPayload);
  return response.status(200).send({ message: "success" });
});

server.post(`${depositReconciledPath}-carol`, async (request, response) => {
  carolEvts[EngineEvents.DEPOSIT_RECONCILED].evt.post(request.body as DepositReconciledPayload);
  return response.status(200).send({ message: "success" });
});

server.post(`${withdrawalCreatedPath}-carol`, async (request, response) => {
  carolEvts[EngineEvents.WITHDRAWAL_CREATED].evt.post(request.body as WithdrawalCreatedPayload);
  return response.status(200).send({ message: "success" });
});

server.post(`${withdrawalResolvedPath}-carol`, async (request, response) => {
  carolEvts[EngineEvents.WITHDRAWAL_RESOLVED].evt.post(request.body as WithdrawalResolvedPayload);
  return response.status(200).send({ message: "success" });
});

server.post(`${withdrawalReconciledPath}-carol`, async (request, response) => {
  carolEvts[EngineEvents.WITHDRAWAL_RECONCILED].evt.post(request.body as WithdrawalReconciledPayload);
  return response.status(200).send({ message: "success" });
});

server.post(`${channelDisputedPath}-carol`, async (request, response) => {
  carolEvts[EngineEvents.CHANNEL_DISPUTED].evt.post(
    request.body as ChannelDisputedPayload & { publicIdentifier: string },
  );
  return response.status(200).send({ message: "success" });
});

server.post(`${conditionalTransferCreatedPath}-dave`, async (request, response) => {
  daveEvts[EngineEvents.CONDITIONAL_TRANSFER_CREATED].evt.post(request.body as ConditionalTransferCreatedPayload);
  return response.status(200).send({ message: "success" });
});

server.post(`${conditionalTransferResolvedPath}-dave`, async (request, response) => {
  daveEvts[EngineEvents.CONDITIONAL_TRANSFER_RESOLVED].evt.post(request.body as ConditionalTransferResolvedPayload);
  return response.status(200).send({ message: "success" });
});

server.post(`${depositReconciledPath}-dave`, async (request, response) => {
  daveEvts[EngineEvents.DEPOSIT_RECONCILED].evt.post(request.body as DepositReconciledPayload);
  return response.status(200).send({ message: "success" });
});

server.post(`${withdrawalCreatedPath}-dave`, async (request, response) => {
  daveEvts[EngineEvents.WITHDRAWAL_CREATED].evt.post(request.body as WithdrawalCreatedPayload);
  return response.status(200).send({ message: "success" });
});

server.post(`${withdrawalResolvedPath}-dave`, async (request, response) => {
  daveEvts[EngineEvents.WITHDRAWAL_RESOLVED].evt.post(request.body as WithdrawalResolvedPayload);
  return response.status(200).send({ message: "success" });
});

server.post(`${withdrawalReconciledPath}-dave`, async (request, response) => {
  daveEvts[EngineEvents.WITHDRAWAL_RECONCILED].evt.post(request.body as WithdrawalReconciledPayload);
  return response.status(200).send({ message: "success" });
});

server.post(`${channelDisputedPath}-dave`, async (request, response) => {
  daveEvts[EngineEvents.CHANNEL_DISPUTED].evt.post(
    request.body as ChannelDisputedPayload & { publicIdentifier: string },
  );
  return response.status(200).send({ message: "success" });
});

server.listen(env.port, "0.0.0.0", (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server listening at ${address}`);
});
