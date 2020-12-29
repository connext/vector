import { task } from "hardhat/config";
import pino from "pino";

export default task("change-transfer-registry-owner", "Change transfer registry owner")
  .addParam("newOwner", "Address of the new owner")
  .addParam("signerAddress", "The address that will sign the registration tx")
  .addOptionalParam("logLevel", "One of 'debug', 'info', 'warn', 'error', 'silent' (default: info)")
  .setAction(
    async (args, hre): Promise<void> => {
      const { newOwner, logLevel, signerAddress } = args;
      const log = pino({ level: logLevel || "info" });

      log.info(`Preparing to add ${newOwner} to as owner of transfer registry (Sender=${signerAddress})`);
      const registry = await (hre.ethers as any).getContract("TransferRegistry", signerAddress);
      const currentOwner = await registry.owner();
      log.info(`Current owner: ${currentOwner}`);

      const tx = await registry.transferOwnership(newOwner);
      log.info({ hash: tx.hash }, "transferOwnership tx broadcast");

      await tx.wait();
      log.info(`transferOwnership tx mined!`);

      const _newOwner = await registry.owner();
      log.info(`New owner: ${_newOwner}`);
    },
  );
