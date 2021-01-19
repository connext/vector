import { task } from "hardhat/config";
import pino from "pino";

export default task("drip", "Mints tokens to given address")
  .addParam("address", "The address to drip funds to")
  .addOptionalParam("signerAddress", "The address that will sign the registration tx")
  .addOptionalParam("amount", "The amount to mint in wei (default: 10 tokens)")
  .addOptionalParam("logLevel", "One of 'debug', 'info', 'warn', 'error', 'silent' (default: info)")
  .setAction(
    async (args, hre): Promise<void> => {
      const { address, logLevel, amount, signerAddress } = args;
      const toDrip = amount ?? (hre.ethers as any).utils.parseEther("10");
      const log = pino({ level: logLevel ?? "info" });
      log.info(`Preparing to drip ${(hre.ethers as any).utils.formatEther(toDrip)} tokens to addr=${address}`);
      const token = await (hre.ethers as any).getContract("TestToken", signerAddress ?? address);
      const mint = await token.mint(address, toDrip);
      log.info(`Transaction: ${mint.hash}`);
      await mint.wait();
      log.info(`Successfully minted tokens`);
    },
  );
