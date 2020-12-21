import { BigNumber } from "@ethersproject/bignumber";
import { EtherSymbol, Zero } from "@ethersproject/constants";
import { formatEther } from "@ethersproject/units";
import { deployments, ethers, getNamedAccounts, getChainId } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";

import { registerTransfer } from "../src.ts/utils";
import { logger } from "../src.ts/constants";

const func: DeployFunction = async () => {
  const log = logger.child({ module: "Deploy" });
  const chainId = await getChainId();
  const provider = ethers.provider;
  const { deployer } = await getNamedAccounts();

  // Log initial state
  const balance = await provider.getBalance(deployer);
  const nonce = await provider.getTransactionCount(deployer);
  log.info(`Preparing to migrate contracts to chain ${chainId}`);
  log.info(`Deployer address=${deployer} nonce=${nonce} balance=${formatEther(balance)}`);

  if (balance.eq(Zero)) {
    throw new Error(`Account ${deployer} has zero balance on chain ${chainId}, aborting migration`);
  }

  ////////////////////////////////////////
  // Run the migration

  type Args = Array<string | BigNumber>;
  const migrate = async (name: string, args: Args): Promise<void> => {
    const processedArgs = await Promise.all(args.map(async (arg: any): Promise<any> => {
      try {
        return (await deployments.get(arg)).address;
      } catch (e) {
        return arg;
      }
    }));
    log.info(`Deploying ${name} with args [${processedArgs.join(", ")}]`);
    await deployments.deploy(name, {
      from: deployer,
      args: processedArgs,
      /*
      gasLimit: deployTx.gasLimit && BigNumber.from(deployTx.gasLimit).lt(MIN_GAS_LIMIT)
        ? MIN_GAS_LIMIT
        : undefined,
      */
    });
    const deployment = await deployments.get(name);
    if (!deployment.transactionHash) {
      throw new Error(`Failed to deploy ${name}`);
    }
    const tx = await ethers.provider.getTransaction(deployment.transactionHash!);
    const receipt = await ethers.provider.getTransactionReceipt(deployment.transactionHash!);
    log.info(`Sent transaction to deploy ${name}, txHash: ${deployment.transactionHash}`);
    log.info(
      `Success! Consumed ${receipt.gasUsed} gas worth ${EtherSymbol} ${formatEther(
        (receipt.gasUsed || Zero).mul(tx.gasPrice),
      )} deploying ${name} to address: ${deployment.address}`,
    );
  };

  // Don't migrate to mainnet until audit is finished
  if (chainId === "1") {
    log.info(`Running mainnet migration`);
    throw new Error(`Contract migration for chain ${chainId} is not supported yet`);

  } else if (chainId === "4" || chainId === "5" || chainId === "42" || chainId === "80001") {
    log.info(`Running testnet migration`);

    for (const row of [
      ["HashlockTransfer", []],
      ["Withdraw", []],
      ["TransferRegistry", []],
      ["ChannelMastercopy", []],
      ["ChannelFactory", ["ChannelMastercopy", Zero]],
      ["TestToken", []],
    ]) {
      const name = row[0] as string;
      const args = row[1] as Array<string | BigNumber>;
      await migrate(name, args);
    }

    await registerTransfer("Withdraw", deployer);
    await registerTransfer("HashlockTransfer", deployer);

  // Default: run testnet migration
  } else {
    log.info(`Running localnet migration`);

    for (const row of [
      ["HashlockTransfer", []],
      ["Withdraw", []],
      ["TransferRegistry", []],
      ["TestLibIterableMapping", []],
      ["CMCAsset", []],
      ["ChannelMastercopy", []],
      ["ChannelFactory", ["ChannelMastercopy", Zero]],
      ["TestChannel", []],
      ["TestChannelFactory", ["TestChannel", Zero]],
      ["TestToken", []],
      ["FailingToken", []],
      ["NonconformingToken", []],
    ]) {
      const name = row[0] as string;
      const args = row[1] as Array<string | BigNumber>;
      await migrate(name, args);
    }

    await registerTransfer("Withdraw", deployer);
    await registerTransfer("HashlockTransfer", deployer);

  }

  ////////////////////////////////////////
  // Print summary
  log.info("All done!");
  const spent = formatEther(balance.sub(await provider.getBalance(deployer)));
  const nTx = (await provider.getTransactionCount(deployer)) - nonce;
  log.info(`Sent ${nTx} transaction${nTx === 1 ? "" : "s"} & spent ${EtherSymbol} ${spent}`);
};
export default func;
