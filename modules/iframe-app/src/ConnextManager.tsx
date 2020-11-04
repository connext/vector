import { Wallet, utils } from "ethers";
import { BrowserNode } from "@connext/vector-browser-node";
import { JsonRpcRequest, ChannelRpcMethod } from "@connext/vector-types";
import { ChannelSigner } from "@connext/vector-utils";
import pino from "pino";

export function payloadId(): number {
  const date = new Date().getTime() * Math.pow(10, 3);
  const extra = Math.floor(Math.random() * Math.pow(10, 3));
  return date + extra;
}

export default class ConnextManager {
  private parentOrigin: string;
  private privateKey: string | undefined;
  private browserNode: BrowserNode | undefined;
  private channelAddress: string | undefined;

  constructor() {
    this.parentOrigin = new URL(document.referrer).origin;
    window.addEventListener("message", e => this.handleIncomingMessage(e), true);
    if (document.readyState === "loading") {
      window.addEventListener("DOMContentLoaded", () => {
        window.parent.postMessage("event:iframe-initialized", this.parentOrigin as string);
      });
    } else {
      window.parent.postMessage("event:iframe-initialized", this.parentOrigin);
    }
  }

  private async initChannel(
    ethProviderUrl: string,
    nodePublicIdentifier: string,
    signature: string,
  ): Promise<BrowserNode> {
    // use the entropy of the signature to generate a private key for this wallet
    // since the signature depends on the private key stored by Magic/Metamask, this is not forgeable by an adversary
    const mnemonic = utils.entropyToMnemonic(utils.keccak256(signature));
    this.privateKey = Wallet.fromMnemonic(mnemonic).privateKey;
    const chainId = 1337; // TODO: get from ethProvider
    this.browserNode = await BrowserNode.connect({
      signer: new ChannelSigner(this.privateKey),
      chainAddresses: {},
      chainProviders: { [chainId]: ethProviderUrl },
      logger: pino(),
      messagingUrl: "https://messaging.connext.network",
    });
    const channel = await this.browserNode.setup({
      chainId,
      counterpartyIdentifier: nodePublicIdentifier,
      timeout: "86400",
    });
    if (channel.isError) {
      throw channel.getError();
    }
    this.channelAddress = channel.getValue().channelAddress;
    return this.browserNode;
  }

  private async handleIncomingMessage(e: MessageEvent) {
    if (e.origin !== this.parentOrigin) return;
    const request = JSON.parse(e.data);
    let response: any;
    try {
      const result = await this.handleRequest(request);
      response = { id: request.id, result };
    } catch (e) {
      console.error(e);
      response = { id: request.id, error: { message: e.message } };
    }
    window.parent.postMessage(JSON.stringify(response), this.parentOrigin);
  }

  private async handleRequest(request: JsonRpcRequest) {
    if (request.method === "connext_authenticate") {
      await this.initChannel(request.params.ethProviderUrl, request.params.nodeUrl, request.params.signature);
      return { success: true };
    }
    if (typeof this.browserNode === "undefined") {
      throw new Error(
        "Channel provider not initialized within iframe app - ensure that connext_authenticate is called before any other commands",
      );
    }
    if (request.method === "chan_subscribe") {
      const subscription = utils.keccak256(utils.toUtf8Bytes(`${request.id}`));
      const listener = (data: any) => {
        const payload: JsonRpcRequest = {
          id: payloadId(),
          jsonrpc: "2.0",
          method: "chan_subscription",
          params: {
            subscription,
            data,
          },
        };
        window.parent.postMessage(JSON.stringify(payload), this.parentOrigin);
      };
      if (request.params.once) {
        this.browserNode.once(request.params.event, listener);
      } else {
        this.browserNode.on(request.params.event, listener);
      }
      return subscription;
    }
    if (request.method === "chan_unsubscribeAll") {
      // this.browserNode.removeAllListeners();
      return true;
    }
    return await this.browserNode.send(request.method as ChannelRpcMethod, request.params);
  }
}
