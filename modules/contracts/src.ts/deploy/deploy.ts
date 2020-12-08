import { EtherSymbol, Zero } from "@ethersproject/constants";
import { JsonRpcProvider } from "@ethersproject/providers";
import { formatEther } from "@ethersproject/units";
import { Wallet } from "@ethersproject/wallet";
import {HardhatRuntimeEnvironment} from "hardhat/types";
import {DeployFunction} from "hardhat-deploy/types";

import { getAddressBook } from "../addressBook";
import { deployContracts } from "../actions/deployContracts";
import { registerTransfer } from "../actions/registerTransfer";
import { logger } from "../constants";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {

  const mnemonic = process.env.MNEMONIC || "";
  const provider = hre.waffle.provider;
  const addressBookPath = process.env.ADDRESS_BOOK || "/data/address-book.json";
  const silent = false; 

  const wallet = Wallet.fromMnemonic(mnemonic).connect(provider);
  const addressBook = getAddressBook(
    addressBookPath,
    (await wallet.provider.getNetwork()).chainId.toString(),
  );
  const log = logger.child({ level: silent ? "silent" : "info" });

  // Setup env & log initial state
  const chainId = ((await wallet.provider.getNetwork()).chainId).toString();
  const balance = await wallet.getBalance();
  const nonce = await wallet.getTransactionCount();
  const providerUrl = (wallet.provider as JsonRpcProvider).connection.url;

  log.info(`Preparing to migrate contracts to provider ${providerUrl} w chainId: ${chainId} (addressBook at ${addressBookPath})`);
  log.info(`Deployer address=${wallet.address} nonce=${nonce} balance=${formatEther(balance)}`);

  if (balance.eq(Zero)) {
    throw new Error(`Account ${wallet.address} has zero balance on chain ${chainId}, aborting migration`);
  }

  ////////////////////////////////////////
  // Run the migration

  // Don't migrate to mainnet until disputes are working & major vulnerabilities are mitigated
  if (chainId === "1") {
    throw new Error(`Contract migration for chain ${chainId} is not supported yet`);

    // Default: run testnet migration
  } else {
    await deployContracts(
      wallet,
      addressBook,
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
    await registerTransfer("Withdraw", wallet, addressBook, log);
    await registerTransfer("HashlockTransfer", wallet, addressBook, log);
  }

  ////////////////////////////////////////
  // Print summary
  log.info("All done!");
  const spent = formatEther(balance.sub(await wallet.getBalance()));
  const nTx = (await wallet.getTransactionCount()) - nonce;
  log.info(`Sent ${nTx} transaction${nTx === 1 ? "" : "s"} & spent ${EtherSymbol} ${spent}`);
};
export default func;
