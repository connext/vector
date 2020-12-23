export const env = {
  adminToken: process.env.VECTOR_ADMIN_TOKEN || "cxt1234",
  aliceUrl: process.env.VECTOR_ALICE_URL || "http://alice:8000",
  aliceMnemonic:
    process.env.VECTOR_ALICE_MNEMONIC ||
    "avoid post vessel voyage trigger real side ribbon pattern neither essence shine",
  messagingUrl: process.env.VECTOR_MESSAGING_URL || "http://messaging",
  bobUrl: process.env.VECTOR_BOB_URL || "http://bob:8000",
  bobMnemonic:
    process.env.VECTOR_BOB_MNEMONIC || "negative stamp rule dizzy embark worth ill popular hip ready truth abandon",
  carolUrl: process.env.VECTOR_CAROL_URL || "http://carol:8000",
  chainProviders: JSON.parse(process.env.VECTOR_CHAIN_PROVIDERS || "{}"),
  chainAddresses: JSON.parse(process.env.VECTOR_CHAIN_ADDRESSES || "{}"),
  daveUrl: process.env.VECTOR_DAVE_URL || "http://dave:8000",
  logLevel: process.env.VECTOR_LOG_LEVEL || "warn",
  nodeUrl: process.env.VECTOR_NODE_URL || "http://node:8000",
  nodeContainerUrl: process.env.VECTOR_NODE_CONTAINER_URL || "http://vector_node:8000",
  rogerUrl: process.env.VECTOR_ROGER_URL || "http://roger:8000",
  routerUrl: process.env.VECTOR_ROUTER_URL || "http://router:8008",
  sugarDaddy: process.env.SUGAR_DADDY || "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat",
  port: parseInt(process.env.VECTOR_PORT || "8888"),
  testerName: process.env.VECTOR_TESTER_NAME || "vector_trio_test_runner",
};
