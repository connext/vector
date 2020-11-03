import { HexString, PublicKey } from "@connext/vector-types";
import { utils } from "ethers";
import {
  arrayToBuffer,
  encrypt as libEncrypt,
  hexToBuffer,
  serialize,
  utf8ToBuffer,
} from "eccrypto-js";

import { isValidHexString } from "./hexStrings";

const { arrayify, hexlify } = utils;

export const INDRA_SIGN_PREFIX = "\x15Indra Signed Message:\n";

export const bufferify = (input: Uint8Array | Buffer | string): Buffer =>
  typeof input === "string"
    ? isValidHexString(input)
      ? hexToBuffer(input)
      : utf8ToBuffer(input)
    : !Buffer.isBuffer(input)
    ? arrayToBuffer(arrayify(input))
    : input;
    
export const encrypt = async (message: string, publicKey: PublicKey): Promise<HexString> =>
  hexlify(serialize(await libEncrypt(bufferify(publicKey), utf8ToBuffer(message))));
