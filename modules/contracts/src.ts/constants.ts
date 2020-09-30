import { Options } from "yargs";

export type ConstructorArgs = { name: string; value: string; }[];

export const defaults = {
  mnemonic: "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat",
  providerUrl: "http://localhost:8545",
  addressBookPath: "./address-book.json",
};

export const cliOpts = {
  addressBook: {
    alias: "address-book",
    description: "The path to your address book file",
    type: "string",
    default: defaults.addressBookPath,
  },
  amount: {
    alias: "amount",
    description: "The amount of tokens or ETH to send",
    type: "string",
    default: "1",
  },
  ethProvider: {
    alias: "eth-provider",
    description: "The URL of an Ethereum provider",
    type: "string",
    default: defaults.providerUrl,
  },
  fromMnemonic: {
    alias: "from-mnemonic",
    description: "The mnemonic for an account which will send funds",
    type: "string",
    default: defaults.mnemonic,
  },
  mnemonic: {
    alias: "mnemonic",
    description: "The mnemonic for an account which will pay for gas",
    type: "string",
    default: defaults.mnemonic,
  },
  toAddress: {
    alias: "to-address",
    description: "The address to which funds will be sent",
    type: "string",
  },
  force: {
    alias: "force",
    description: "Deploy contract even if it's already deployed",
    type: "boolean",
    deafult: false,
  },
  silent: {
    alias: "silent",
    description: "Don't log anything to console",
    type: "boolean",
    deafult: false,
  },
  tokenAddress: {
    alias: "token-address",
    description: "The address of the token",
    type: "string",
  },
  privateKey: {
    alias: "private-key",
    description: "An ethereum private key",
    type: "string",
  },
} as { [key: string]: Options };

