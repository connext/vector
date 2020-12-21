import { RegisteredTransfer, tidy } from "@connext/vector-types";
import { task } from "hardhat/config";
import pino from "pino";

export default task("register-transfer", "Displays first 3 accounts and their recommended gifts")
  .addParam("transferName", "The name of the transfer to register")
  .addParam("signerAddress", "The address that will sign the registration tx")
  .addOptionalParam("logLevel", "One of 'debug', 'info', 'warn', 'error', 'silent' (default: info)")
  .setAction(async (args, hre): Promise<void> => {
    const { transferName, signerAddress, logLevel } = args;
    const log = pino({ level: logLevel || "info" });

    log.info(`Preparing to add ${transferName} to registry (Sender=${signerAddress})`);

    const registry = await (hre.ethers as any).getContract("TransferRegistry", signerAddress);
    const transfer = await (hre.ethers as any).getContract(transferName, signerAddress);

    const registered = await registry.getTransferDefinitions();
    const transferInfo = await transfer.getRegistryInformation();

    // Check if transfer is already in registry
    const entry = registered.find((info: RegisteredTransfer) => info.name === transferName);
    if (entry && entry.definition === transfer.address) {
      log.info({ transferName }, `Transfer has already been registered`);
      return;
    }

    // Check for the case where the registered transfer doesnt have the
    // right address
    if (entry && entry.definition !== transfer.address) {
      // Remove transfer from registry
      log.info(
        { transferName, registered: entry.definition, latest: transfer.address },
        `Transfer has stale registration, removing and updating`,
      );
      const removal = await registry.removeTransferDefinition(transferName);
      log.info({ hash: removal.hash }, "Removal tx broadcast");
      await removal.wait();
      log.info("Removal tx mined");
    }

    log.info({ transferName, latest: transfer.address }, `Getting registry information`);

    // Sanity-check: tidy return value
    const cleaned = {
      name: transferInfo.name,
      definition: transferInfo.definition,
      resolverEncoding: tidy(transferInfo.resolverEncoding),
      stateEncoding: tidy(transferInfo.stateEncoding),
      encodedCancel: transferInfo.encodedCancel,
    };
    log.info(cleaned, `Adding transfer to registry`);
    const response = await registry.addTransferDefinition(cleaned);
    log.info(`Added: ${response.hash}`);
    await response.wait();
    log.info(`Tx mined, successfully added ${cleaned.name} on ${cleaned.definition}`);
  });
