import { expect } from "chai";
import * as EthCrypto from "eth-crypto";
import { Wallet } from "ethers";

import { ChannelSigner, getRandomChannelSigner } from "./channelSigner";
import {
  getEthSignatureError,
  getPublicKeyError,
  getRandomPrivateKey,
  getPublicKeyFromPrivateKey,
  recoverAddressFromChannelMessage,
} from "./crypto";
import { getAddressError } from "./hexStrings";
import { getPublicIdentifierError } from "./identifiers";

const testMessage = "123456789012345";

describe("ChannelSigner", () => {
  it("should generate a valid publicIdentifier", async () => {
    expect(getPublicIdentifierError(getRandomChannelSigner().publicIdentifier)).to.be.undefined;
  });

  it("should generate a valid publicKey", async () => {
    expect(getPublicKeyError(getRandomChannelSigner().publicKey)).to.be.undefined;
  });

  it("should generate a valid address", async () => {
    expect(getAddressError(getRandomChannelSigner().address)).to.be.undefined;
  });

  it("should sign Channel messages", async () => {
    const signer = getRandomChannelSigner();
    const sig = await (signer.signMessage(testMessage));
    expect(getEthSignatureError(sig)).to.be.undefined;
    expect(await recoverAddressFromChannelMessage(testMessage, sig)).to.be.a("string");
  });

  it("should be able to decrypt stuff it encrypts", async () => {
    const sender = getRandomChannelSigner();
    const recipient = getRandomChannelSigner();
    const encrypted = await sender.encrypt(testMessage, recipient.publicKey);
    const decrypted = await recipient.decrypt(encrypted);
    expect(testMessage).to.equal(decrypted);
  });

  it("should decrypt messages longer than 15 chars", async () => {
    const longMessage = "1234567890123456";
    const sender = getRandomChannelSigner();
    const recipient = getRandomChannelSigner();
    const encrypted = await sender.encrypt(longMessage, recipient.publicKey);
    const decrypted = await recipient.decrypt(encrypted);
    expect(longMessage).to.equal(decrypted);
  });

  it("should have encrypt/decrypt that are compatible with eth-crypto", async () => {
    const mySigner = getRandomChannelSigner();
    const ethSignerPrivateKey = getRandomPrivateKey();
    const ethSignerPublicKey = getPublicKeyFromPrivateKey(ethSignerPrivateKey);
    const myEncrypted = await mySigner.encrypt(testMessage, ethSignerPublicKey);
    const ethEncrypted = EthCrypto.cipher.stringify(
      await EthCrypto.encryptWithPublicKey(mySigner.publicKey.replace(/^0x/, ""), testMessage),
    );
    const myDecrypted = await mySigner.decrypt(ethEncrypted);
    const ethDecrypted = await EthCrypto.decryptWithPrivateKey(
      ethSignerPrivateKey,
      EthCrypto.cipher.parse(myEncrypted.replace(/^0x/, "")),
    );
    expect(myDecrypted).to.equal(ethDecrypted);
    expect(myDecrypted).to.equal(testMessage);
  });

  it("should have encrypt/decrypt that are compatible with browser crypto", async () => {
    // Mnemonic was pulled from a testnet daicard that received a test async transfer
    const browserPrivateKey = Wallet.fromMnemonic(
      "rely effort talent genuine pumpkin wire caught coil type alien offer obtain",
      `m/44'/60'/0'/25446/0`,
    ).privateKey;
    const browserMessage = "0xd10d622728d22635333ea792730a0feaede8b61902050a3f8604bb85d7013864";
    const browserEncryptedMessage = "b304bbe1bc97a4f1101f3381b93a837f022b6ef864c41e7b8837779b59be67ef355cf2c918961251ec118da2c0abde3b0e803d817b2a3a318f60609023301748350008307ae20ccb1473eac05aced53180511e97cc4cec5809cb4f2ba43517d7951a71bd56b85ac161b8ccdc98dbeabfa99d555216cda31247c21d4a3caa7c46d37fa229f02f15ba254f8d6f5b15ed5310c35dd9ddd54cd23b99a7e332ed501605";
    const signer = new ChannelSigner(browserPrivateKey);
    const decrypted = await signer.decrypt(browserEncryptedMessage);
    expect(decrypted).to.equal(browserMessage);
  });
});
