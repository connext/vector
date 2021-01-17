import { FullChannelState, Result } from "@connext/vector-types";
import { BaseLogger, Level } from "pino";

import { hashChannelCommitment } from "./channel";
import { recoverAddressFromChannelMessage } from "./crypto";

export async function validateChannelUpdateSignatures(
  state: FullChannelState,
  aliceSignature?: string,
  bobSignature?: string,
  requiredSigners: "alice" | "bob" | "both" = "both",
  logger?: BaseLogger,
): Promise<Result<void | Error>> {
  const log = (msg: string, details: any = {}, level: Level = "info") => {
    if (!logger) {
      return;
    }
    logger[level](details, msg);
  };
  // Generate the commitment
  const { networkContext, ...core } = state;
  let hash: string;
  try {
    hash = hashChannelCommitment(core);
  } catch (e) {
    return Result.fail(new Error("Failed to generate channel commitment hash"));
  }

  // Create a recovery helper to catch errors
  const tryRecovery = async (sig?: string, expectedSigner?: string): Promise<string> => {
    log("Attempting recovery", { hash, sig }, "debug");
    if (!sig) {
      return "No signature provided";
    }
    let recovered: string;
    try {
      recovered = await recoverAddressFromChannelMessage(hash, sig);
    } catch (e) {
      log("Recovery failed", { hash, sig, recoveryError: e.message, expectedSigner, state }, "error");
      recovered = e.message;
    }
    return recovered;
  };

  const [rAlice, rBob] = await Promise.all([
    tryRecovery(aliceSignature, state.alice),
    tryRecovery(bobSignature, state.bob),
  ]);

  const aliceSigned = rAlice === state.alice;
  const bobSigned = rBob === state.bob;

  const bobNeeded = requiredSigners === "bob" || requiredSigners === "both";
  const aliceNeeded = requiredSigners === "alice" || requiredSigners === "both";

  // Check if signers are required and valid
  if (aliceNeeded && bobNeeded && aliceSigned && bobSigned) {
    return Result.ok(undefined);
  }

  // Only one signer is required, but if there are two signatures both
  // should be valid
  if (aliceNeeded && aliceSigned && !bobSignature && !bobNeeded) {
    return Result.ok(undefined);
  }

  if (bobNeeded && bobSigned && !aliceSignature && !aliceNeeded) {
    return Result.ok(undefined);
  }

  // Only one is required, but both are provided (and should be valid)
  if (aliceSignature && aliceSigned && bobSignature && bobSigned) {
    return Result.ok(undefined);
  }

  // Construct an explicit error message
  const prefix = `Expected ${requiredSigners === "both" ? "alice + bob" : requiredSigners} ${
    aliceNeeded ? state.alice : ""
  }${bobNeeded ? " + " + state.bob : ""}. Got: `;

  const details = `${aliceNeeded ? "(alice) " + rAlice : ""}${bobNeeded ? "+ (bob) " + rBob : ""}`;

  return Result.fail(new Error(prefix + details));
}
