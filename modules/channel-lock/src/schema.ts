import { FastifySchema } from "fastify";

export type RoutesSchema = {
  post: { [routeName: string]: { route: string; schema: FastifySchema } };
  get: { [routeName: string]: { route: string; schema: FastifySchema } };
};

export const Routes: RoutesSchema = {
  get: {
    getNonce: {
      route: "auth/:userIdentifier",
      schema: {
        params: {
          type: "object",
          required: ["userIdentifier"],
          properties: {
            userIdentifier: { type: "string" },
          },
        },
      },
    },
  },
  post: {
    verifyNonce: {
      route: "auth",
      schema: {
        body: {
          type: "object",
          required: ["userIdentifier", "sig"],
          properties: {
            sig: { type: "string" },
            userIdentifier: { type: "string" },
            adminToken: { type: "string" },
          },
        },
      },
    },
  },
};
