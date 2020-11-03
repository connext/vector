import { expect } from "chai";
import { utils, Wallet } from "ethers";
import { parseEther } from "ethers/lib/utils";
import * as hardhat from "hardhat";

const MIN_BALANCE = parseEther("0.1");
export const provider = hardhat.waffle.provider;
const hdNode = utils.HDNode.fromMnemonic(process.env.SUGAR_DADDY!).derivePath("m/44'/60'/0'/0");
export const wallets: Wallet[] = Array(20)
  .fill(0)
  .map((_, idx) => {
    const wallet = new Wallet(hdNode.derivePath(idx.toString()).privateKey, provider);
    return wallet;
  });

export const chainIdReq = provider.getNetwork().then(net => net.chainId);
export const alice = wallets[0];
export const bob = wallets[1];
export const rando = wallets[2];

before(async () => {
  let balance = await provider.getBalance(alice.address);
  expect(balance).to.be.gte(
    MIN_BALANCE,
    `Expected ${alice.address} to have at least ${MIN_BALANCE.toString()} (current balance: ${balance.toString()})`,
  );
  balance = await provider.getBalance(bob.address);
  expect(balance).to.be.gte(
    MIN_BALANCE,
    `Expected ${bob.address} to have at least ${MIN_BALANCE.toString()} (current balance: ${balance.toString()})`,
  );
  balance = await provider.getBalance(rando.address);
  expect(balance).to.be.gte(
    MIN_BALANCE,
    `Expected ${rando.address} to have at least ${MIN_BALANCE.toString()} (current balance: ${balance.toString()})`,
  );
});
