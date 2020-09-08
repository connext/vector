export const Routes = {
  post: {
    createChannel: {
      route: "create-channel",
      schema: {
        body: {
          type: "object",
          required: ["publicIdentifier", "chainId"],
          properties: {
            publicIdentifier: { type: "string" },
            chainId: { type: "number" },
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
