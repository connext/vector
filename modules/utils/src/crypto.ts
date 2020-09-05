import {
  Address,
  Bytes32,
  HexString,
  PublicKey,
  PrivateKey,
  SignatureString,
} from "@connext/types";
import { utils } from "ethers";
import {
  arrayToBuffer,
  concatBuffers,
  decompress,
  decrypt as libDecrypt,
  deserialize,
  encrypt as libEncrypt,
  getPublic,
  hexToBuffer,
  isDecompressed,
  keccak256,
  recover,
  serialize,
  sign,
  utf8ToBuffer,
} from "eccrypto-js";

import { getAddressError, getHexStringError, isValidHexString } from "./hexStrings";

const { arrayify, getAddress, hexlify, randomBytes, toUtf8String } = utils;

export const INDRA_SIGN_PREFIX = "\x15Indra Signed Message:\n";

////////////////////////////////////////
// Misc

export const bufferify = (input: Uint8Array | Buffer | string): Buffer =>
  typeof input === "string"
    ? isValidHexString(input)
      ? hexToBuffer(input)
      : utf8ToBuffer(input)
    : !Buffer.isBuffer(input)
    ? arrayToBuffer(arrayify(input))
    : input;

////////////////////////////////////////
// Validators

export const getPublicKeyError = (value: any): string | undefined => {
  try {
    const hexStringError = getHexStringError(value, 65);
    if (hexStringError) return hexStringError;
    const addressError = getAddressError(getAddressFromPublicKey(value));
    return addressError
      ? `Got invalid address from public key ${value}: ${addressError}`
      : undefined;
  } catch (e) {
    return e.message;
  }
};
export const isValidPublicKey = (value: any): boolean => !getPublicKeyError(value);

export const getPrivateKeyError = (value: any): string | undefined => {
  try {
    const hexStringError = getHexStringError(value, 32);
    if (hexStringError) return hexStringError;
    const addressError = getAddressError(getAddressFromPrivateKey(value));
    return addressError ? `Got invalid address from private key: ${addressError}` : undefined;
  } catch (e) {
    return e.message;
  }
};
export const isValidPrivateKey = (value: any): boolean => !getPrivateKeyError(value);

export const getEthSignatureError = (value: any): string | undefined => {
  const hexStringError = getHexStringError(value, 65);
  if (hexStringError) return hexStringError;
  return undefined;
};
export const isValidEthSignature = (value: any): boolean => !getEthSignatureError(value);

////////////////////////////////////////
// Conversions

export const getPublicKeyFromPrivateKey = (privateKey: PrivateKey): PublicKey =>
  hexlify(getPublic(bufferify(privateKey)));

export const getAddressFromPublicKey = (publicKey: PublicKey): Address => {
  const buf = bufferify(publicKey);
  return getAddress(
    hexlify(keccak256((isDecompressed(buf) ? buf : decompress(buf)).slice(1)).slice(12)),
  );
};

export const getAddressFromPrivateKey = (privateKey: PrivateKey): Address =>
  getAddressFromPublicKey(getPublicKeyFromPrivateKey(privateKey));

////////////////////////////////////////
// Generators

export const getRandomPrivateKey = (): PrivateKey => hexlify(randomBytes(32));

export const getRandomPublicKey = (): PublicKey =>
  getPublicKeyFromPrivateKey(getRandomPrivateKey());

export const getRandomSignature = getRandomPublicKey;

////////////////////////////////////////
// Crypto functions

export const hashChannelMessage = (message: string): Bytes32 =>
  hexlify(
    keccak256(
      concatBuffers(
        bufferify(INDRA_SIGN_PREFIX),
        bufferify(`${bufferify(message).length}`),
        bufferify(message),
      ),
    ),
  );

export const encrypt = async (message: string, publicKey: PublicKey): Promise<HexString> =>
  hexlify(serialize(await libEncrypt(bufferify(publicKey), utf8ToBuffer(message))));

export const decrypt = async (encrypted: HexString, privateKey: PrivateKey): Promise<HexString> =>
  toUtf8String(
    await libDecrypt(
      bufferify(privateKey),
      deserialize(bufferify(`0x${encrypted.replace(/^0x/, "")}`)),
    ),
  );

export const signChannelMessage = async (
  message: string,
  privateKey: PrivateKey,
): Promise<HexString> =>
  hexlify(await sign(bufferify(privateKey), bufferify(hashChannelMessage(message)), true));

export const recoverAddressFromChannelMessage = async (
  message: HexString,
  sig: SignatureString,
): Promise<Address> =>
  getAddressFromPublicKey(
    hexlify(await recover(bufferify(hashChannelMessage(message)), bufferify(sig))),
  );
