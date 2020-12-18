import { EtherSymbol, Zero } from "@ethersproject/constants";
import { formatEther } from "@ethersproject/units";
import { deployments, ethers } from "hardhat";

import { logger } from "../constants";

// 3rd arg is: [ContractName, [ConstructorArgs]][]
// If a ContractName is given as a ConstructorArg, it will be replaced by that contract's address
export const deployContracts = async (
  deployer: string,
  schema: [string, any[]][],
  log = logger.child({}),
): Promise<void> => {

  for (const [name, args] of schema) {
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
  }

};
