import { EtherSymbol, Zero } from "@ethersproject/constants";
import { formatEther } from "@ethersproject/units";
import { deployments, ethers, getNamedAccounts, getChainId } from "hardhat";
// import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// import { getAddressBook } from "../addressBook";
import { deployContracts } from "../actions/deployContracts";
// import { registerTransfer } from "../actions/registerTransfer";
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
    // await registerTransfer("Withdraw", deployer, null, log);
    // await registerTransfer("HashlockTransfer", deployer, null, log);

    /*
    for (const scheme of [
      ["TestToken", []],
      ["ChannelMastercopy", []],
      ["ChannelFactory", ["ChannelMastercopy", Zero]],
      ["HashlockTransfer", []],
      ["Withdraw", []],
      ["TransferRegistry", []],
    ]) {
      const [name, args] = scheme;
      await deployments.deploy(name, {
        from: deployer,
        args,
      });
      log.info(`Deployed ${name} to ${(await deployments.get(name)).address}!`);
    }
    */

    /*
    await deployments.deploy("TestToken", {
      from: deployer,
      args: [],
    });
    log.info(`Deployed TestToken to ${(await deployments.get("TestToken")).address}!`);
    await deployments.deploy("ChannelMastercopy", {
      from: deployer,
      args: [],
    });
    const mastercopyAddress = (await deployments.get("ChannelMastercopy")).address;
    log.info(`Deployed ChannelMastercopy to ${mastercopyAddress}!`);
    await deployments.deploy("ChannelFactory", {
      from: deployer,
      args: [mastercopyAddress, Zero],
    });
    log.info(`Deployed ChannelFactory to ${(await deployments.get("ChannelFactory")).address}!`);
    */

  }

  ////////////////////////////////////////
  // Print summary
  log.info("All done!");
  const spent = formatEther(balance.sub(await provider.getBalance(deployer)));
  const nTx = (await provider.getTransactionCount(deployer)) - nonce;
  log.info(`Sent ${nTx} transaction${nTx === 1 ? "" : "s"} & spent ${EtherSymbol} ${spent}`);
};
export default func;
