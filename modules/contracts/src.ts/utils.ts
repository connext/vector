// import { Contract } from "@ethersproject/contracts";
// import { Signer } from "@ethersproject/abstract-signer";
import { /* deployments,*/ ethers } from "hardhat";

console.log(`ethers props: [${Object.keys(ethers).join(", ")}]`);
export const getContract = (ethers as any).getContract;
/*
export const getContract = async (name: string, signer?: Signer): Promise<Contract> => {
    const deployment = await deployments.get(name);
    return new Contract(
      deployment.address,
      deployment.abi,
      signer || ethers.provider,
    );
};
*/
