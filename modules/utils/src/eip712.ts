import { utils } from "ethers";
import {
  EIP712Domain,
  PrivateKey,
  Receipt,
  DOMAIN_NAME,
  DOMAIN_SALT,
  DOMAIN_VERSION,
} from "@connext/types";
import { hexlify } from "ethers/lib/utils";
import { sign } from "eccrypto-js";
import { bufferify } from "./crypto";

const { keccak256, toUtf8Bytes, defaultAbiCoder, solidityKeccak256 } = utils;

export const hashString = (str: string) => keccak256(toUtf8Bytes(str));

export const hashTypedMessage = (domainSeparator: string, messageHash: string): string =>
  solidityKeccak256(["string", "bytes32", "bytes32"], ["\x19\x01", domainSeparator, messageHash]);

export const hashStruct = (typeHash: string, types: string[], values: any[]) => {
  types.forEach((type, i) => {
    if (["string", "bytes"].includes(type)) {
      types[i] = "bytes32";
      if (type === "string") {
        values[i] = hashString(values[i]);
      } else {
        values[i] = keccak256(values[i]);
      }
    }
  });
  return keccak256(defaultAbiCoder.encode(["bytes32", ...types], [typeHash, ...values]));
};

export const DOMAIN_TYPE_HASH = hashString(
  "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)",
);

export const hashDomainSeparator = (domain: EIP712Domain) =>
  hashStruct(
    DOMAIN_TYPE_HASH,
    ["string", "string", "uint256", "address", "bytes32"],
    [domain.name, domain.version, domain.chainId, domain.verifyingContract, domain.salt],
  );

export const RECEIPT_TYPE_HASH = hashString("Receipt(bytes32 paymentId,bytes32 data)");

export const hashReceiptData = (receipt: Receipt) =>
  hashStruct(RECEIPT_TYPE_HASH, ["bytes32", "bytes32"], [receipt.paymentId, receipt.data]);

export const hashReceiptMessage = (domain: EIP712Domain, receipt: Receipt): string =>
  hashTypedMessage(hashDomainSeparator(domain), hashReceiptData(receipt));

export const signReceiptMessage = async (
  domain: EIP712Domain,
  receipt: Receipt,
  privateKey: PrivateKey,
) =>
  hexlify(await sign(bufferify(privateKey), bufferify(hashReceiptMessage(domain, receipt)), true));

export const getTestEIP712Domain = (chainId: number): EIP712Domain => ({
  name: DOMAIN_NAME,
  version: DOMAIN_VERSION,
  chainId,
  verifyingContract: "0x1d85568eEAbad713fBB5293B45ea066e552A90De",
  salt: DOMAIN_SALT,
});
