import { FastifySchema } from "fastify";

export type RoutesSchema = { post: { [routeName: string]: { route: string; schema: FastifySchema } } };

export const Routes: RoutesSchema = {
  post: {
    setup: {
      route: "auth/:userIdentifier",
      schema: {
        params: {},
        body: {
          type: "object",
          required: ["counterpartyIdentifier", "chainId", "timeout"],
          properties: {
            counterpartyIdentifier: { type: "string" },
            chainId: { type: "number" },
            timeout: { type: "string" },
          },
        },
      },
    },
    deposit: {
      route: "deposit",
      schema: {
        body: {
          type: "object",
          required: ["channelId", "amount", "assetId"],
          properties: {
            channelId: { type: "string" },
            amount: { type: "string" },
            assetId: { type: "string" },
          },
        },
      },
    },
    createTransfer: {
      route: "create-transfer",
      schema: {
        body: {
          type: "object",
          required: ["channelId", "amount", "assetId", "paymentId", "preImage"],
          properties: {
            channelId: { type: "string" },
            amount: { type: "string" },
            assetId: { type: "string" },
            recipient: { type: "string" },
            paymentId: { type: "string" },
            preImage: { type: "string" },
            meta: { type: "object" },
          },
        },
      },
    },
  },
};
