import pino from "pino";
import { ethers }from "hardhat";
import { Options } from "yargs";

export const eth = ethers;

// While debugging tests, you can change this to be "info" or "debug"
export const logger = pino({ level: process.env.LOG_LEVEL || "silent" });

export const defaults = {
  mnemonic:
    "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat",
  providerUrl: "http://localhost:8545",
};

export const cliOpts = {
  bobAddress: {
    alias: "bob",
    description: "The counterparty to create a channel with",
    type: "string",
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
  transferName: {
    alias: "transfer-name",
    description: "Name of transfer to add to registry",
    type: "string",
    default: "HashlockTransfer",
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
    default: false,
  },
  silent: {
    alias: "silent",
    description: "Don't log anything to console",
    type: "boolean",
    default: false,
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
