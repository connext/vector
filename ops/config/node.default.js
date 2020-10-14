const { AddressZero } = require("@ethersproject/constants");

let addressBook;
try {
  addressBook = require("./address-book.json");
} catch (e) {
  // In case we're loading defaults from ops/config/*.default.js
  addressBook = require("../../address-book.json");
}

// TODO: if testnet chainId then use .chaindata/address-book.json instead of the prod one?

const chainProviders = {
  "1337": "http://evm_1337:8545",
  "1338": "http://evm_1338:8545",
};

chainAddresses = {};
Object.keys(chainProviders).forEach(chainId => {
  if (addressBook[chainId]) {
    chainAddresses[chainId] = {};
    Object.entries(addressBook[chainId]).forEach(([key, value]) => {
      const newKey = key.charAt(0).toLowerCase() + key.substring(1) + "Address";
      chainAddresses[chainId][newKey] = value.address;
    });
  } else {
    chainAddresses[chainId] = {
      channelFactoryAddress: AddressZero,
      channelMastercopyAddress: AddressZero,
      transferRegistryAddress: AddressZero,
      TestToken: AddressZero,
    };
  }
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
