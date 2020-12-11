import { EtherSymbol, Zero } from "@ethersproject/constants";
import { formatEther } from "@ethersproject/units";
import { deployments, ethers, getNamedAccounts, getChainId } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";

import { deployContracts } from "../actions/deployContracts";
import { logger } from "../constants";

const func: DeployFunction = async () => {

  const log = logger.child({ level: "info" });
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

  // Don't migrate to mainnet until audit is finished
  if (chainId === "1") {
    throw new Error(`Contract migration for chain ${chainId} is not supported yet`);

  // Default: run testnet migration
  } else {

    await deployContracts(
      deployer,
      [
        ["TestToken", []],
        ["ChannelMastercopy", []],
        ["ChannelFactory", ["ChannelMastercopy", Zero]],
        ["HashlockTransfer", []],
        ["Withdraw", []],
        ["TransferRegistry", []],
      ],
      log,
    );

  }

  ////////////////////////////////////////
  // Print summary
  log.info("All done!");
  const spent = formatEther(balance.sub(await provider.getBalance(deployer)));
  const nTx = (await provider.getTransactionCount(deployer)) - nonce;
  log.info(`Sent ${nTx} transaction${nTx === 1 ? "" : "s"} & spent ${EtherSymbol} ${spent}`);
};
export default func;
