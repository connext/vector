import { HexString, PublicKey, PrivateKey } from "@connext/vector-types";
import { utils } from "ethers";
import {
  arrayToBuffer,
  decrypt as libDecrypt,
  deserialize,
  encrypt as libEncrypt,
  hexToBuffer,
  serialize,
  utf8ToBuffer,
} from "eccrypto-js";

import { isValidHexString } from "./hexStrings";

const { arrayify, hexlify, toUtf8String } = utils;

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

export const decrypt = async (encrypted: HexString, privateKey: PrivateKey): Promise<HexString> =>
  toUtf8String(await libDecrypt(bufferify(privateKey), deserialize(bufferify(`0x${encrypted.replace(/^0x/, "")}`))));
