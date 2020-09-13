import { Address, PublicKey } from "./basic";
import { JsonRpcRequest } from "./rpc";

export const ChannelMethods = {
  chan_setup: "chan_setup",
  chan_deposit: "chan_deposit",
  chan_createTransfer: "chan_createTransfer",
  chan_resolveTransfer: "chan_resolveTransfer",
  chan_getChannelState: "chan_getChannelState",
  chan_isSigner: "chan_isSigner",
  chan_config: "chan_config",
  chan_enable: "chan_enable",
  chan_signMessage: "chan_signMessage",
  chan_encrypt: "chan_encrypt",
  chan_decrypt: "chan_decrypt",
  chan_restoreState: "chan_restoreState",
  chan_getUserWithdrawal: "chan_getUserWithdrawal",
  chan_setUserWithdrawal: "chan_setUserWithdrawal",
  chan_setStateChannel: "chan_setStateChannel",
  chan_walletDeposit: "chan_walletDeposit",
  chan_getSchemaVersion: "chan_getSchemaVersion",
  chan_updateSchemaVersion: "chan_updateSchemaVersion",
};
export type ChannelMethods = keyof typeof ChannelMethods;

export interface IRpcConnection {
  ////////////////////////////////////////
  // Properties
  connected: boolean;

  ////////////////////////////////////////
  // Methods
  send(payload: JsonRpcRequest): Promise<any>;
  open(): Promise<void>;
  close(): Promise<void>;
}

export interface IEngineProvider {
  ////////////////////////////////////////
  // Properties

  connected: boolean;
  connection: IRpcConnection;

  ////////////////////////////////////////
  // Methods

  enable(): Promise<void>;
  send(method: ChannelMethods, params: any): Promise<any>;
  close(): Promise<void>;

  ///////////////////////////////////
  // GETTERS / SETTERS
  config: never;
  multisigAddress: Address | undefined;
  signerAddress: Address | undefined;

  ///////////////////////////////////
  // LISTENER METHODS
  on(event: string, listener: (...args: any[]) => void): any;
  once(event: string, listener: (...args: any[]) => void): any;
  removeAllListeners(): any;

  ///////////////////////////////////
  // SIGNER METHODS
  isSigner(): Promise<boolean>;
  signMessage(message: string): Promise<string>;
  encrypt(message: string, publicKey: PublicKey): Promise<string>;
  decrypt(encryptedPreImage: string): Promise<string>;

  ///////////////////////////////////
  // STORE METHODS

  ///////////////////////////////////
  // TRANSFER METHODS
  getSchemaVersion(): Promise<number>;
  updateSchemaVersion(version?: number): Promise<void>;
}
