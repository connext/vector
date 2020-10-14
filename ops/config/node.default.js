let addressBook;
try {
  addressBook = require("./address-book.json");
} catch (e) {
  // In case we're loading defaults from ops/config/*.default.js
  addressBook = require("../../address-book.json");
}

const chainProviders = {
  "1337": "http://evm_1337:8545",
  "1338": "http://evm_1338:8545",
};

const defaultAddresses = {
  channelFactoryAddress: "0xF12b5dd4EAD5F743C6BaA640B0216200e89B60Da",
  channelMastercopyAddress: "0x8CdaF0CD259887258Bc13a92C0a6dA92698644C0",
  transferRegistryAddress: "0x345cA3e014Aaf5dcA488057592ee47305D9B3e10",
  TestToken: "0x8f0483125FCb9aaAEFA9209D8E9d7b9C8B9Fb90F",
};

chainAddresses = {};
Object.keys(chainProviders).forEach(chainId => {
  chainAddresses[chainId] = addressBook[chainId] || defaultAddresses;
});

const config = {
  adminToken: "cxt1234",
  chainAddresses,
  chainProviders,
  domainName: "",
  logLevel: "info",
  production: false,
};

// "Output" config by printing it (will be read into ops/start-global.sh by jq)
console.log(JSON.stringify(config));
