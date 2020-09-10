import { Signer, providers } from "ethers";

import { Address, PublicKey, PublicIdentifier } from "./basic";

export interface IChannelSigner extends Signer {
  address: Address;
  decrypt(message: string): Promise<string>;
  encrypt(message: string, publicKey: string): Promise<string>;
  signMessage(message: string): Promise<string>;
  publicKey: PublicKey;
  publicIdentifier: PublicIdentifier;
  connectProvider(provider: string | providers.Provider): Promise<void>;
}
