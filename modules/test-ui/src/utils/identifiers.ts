import { PublicIdentifier } from "@connext/vector-types";
import bs58check from "bs58check";
import { bufferToHex, decompress } from "eccrypto-js";

export const INDRA_PUB_ID_PREFIX = "indra";

export const getPublicKeyFromPublicIdentifier = (publicIdentifier: PublicIdentifier) =>
  `0x${bufferToHex(
    decompress(bs58check.decode(publicIdentifier.replace(INDRA_PUB_ID_PREFIX, ""))),
  )}`;