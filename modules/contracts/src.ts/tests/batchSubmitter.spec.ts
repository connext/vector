/* eslint-disable @typescript-eslint/no-empty-function */
import {
  getCreate2MultisigAddress,
  getMinimalProxyInitCode,
  getPublicIdentifierFromPublicKey,
  expect,
  getSignerAddressFromPublicIdentifier,
} from "@connext/vector-utils";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero, Zero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { deployments, ethers } from "hardhat";
import pino from "pino";

import { ChannelMastercopy } from "../artifacts";
import { alice, bob, chainIdReq, provider } from "../constants";
import { VectorChainReader } from "../services";
import { createChannel, getContract } from "../utils";

describe("ChannelFactory", function () {
  this.timeout(120_000);
  let batchSubmitter: Contract;

  beforeEach(async () => {
    await deployments.fixture(); // Start w fresh deployments
    batchSubmitter = await getContract("BatchSubmitter", alice);
  });

  it("should deploy", async () => {
    expect(batchSubmitter.address).to.be.a("string");
  });

  it("should submit 10 withdrawals and deploy channels");

  it("should submit 10 withdrawals on deployed channels");

  it("should submit 5 withdrawals on deployed channels and 5 withdrawals on deployed channels");

  it("should catch errors on bad withdrawal data and continue submissions");
});