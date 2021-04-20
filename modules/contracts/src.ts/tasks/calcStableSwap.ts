import { Contract } from "@ethersproject/contracts";
import { task } from "hardhat/config";
import pino from "pino";

import { StableMath } from "../../typechain";

export default task("calc-stable-swap", "Calculates a stable swap given reserves")
  .addParam("stableMath", "The address of the StableMath contract")
  .addParam("amplificationParameter", "")
  .addParam("balanceIn", "Balance In")
  .addParam("balanceOut", "Balance Out")
  .addOptionalParam("logLevel", "One of 'debug', 'info', 'warn', 'error', 'silent' (default: info)")
  .setAction(
    async (args, hre): Promise<void> => {
      const { stableMath, amplificationParameter, balanceIn, balanceOut, logLevel } = args;
      const log = pino({ level: logLevel || "info" });
      log.info(`Calculating swap for alice=${balanceIn} and bob=${balanceOut}`);
      const _stableMath = (await hre.ethers.getContractAt("StableMath", stableMath)) as StableMath;
      const tokensOut = await _stableMath._calcOutGivenIn();
    },
  );
