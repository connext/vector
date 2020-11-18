import { Wallet, utils } from "ethers";
import { BrowserNode } from "@connext/vector-browser-node";
import { EngineParams, ChannelRpcMethodsResponsesMap, ChannelRpcMethod } from "@connext/vector-types";
import { ChannelSigner, constructRpcRequest, safeJsonParse } from "@connext/vector-utils";
import pino from "pino";
import { config } from "./config";

export default class ConnextManager {
  private parentOrigin: string;
  private privateKey: string | undefined;
  private browserNode: BrowserNode | undefined;

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

  private async initNode(signature: string): Promise<BrowserNode> {
    // use the entropy of the signature to generate a private key for this wallet
    // since the signature depends on the private key stored by Magic/Metamask, this is not forgeable by an adversary
    const mnemonic = utils.entropyToMnemonic(utils.keccak256(signature));
    this.privateKey = Wallet.fromMnemonic(mnemonic).privateKey;
    const signer = new ChannelSigner(this.privateKey);

    // store publicIdentifier in local storage to see if indexedDB needs to be deleted
    const storedPublicIdentifier = localStorage.getItem("publicIdentifier");
    if (storedPublicIdentifier && storedPublicIdentifier !== signer.publicIdentifier) {
      console.warn("Public identifier does not match what is in storage, deleting store");
      indexedDB.deleteDatabase("VectorIndexedDBDatabase");
    }

    this.browserNode = await BrowserNode.connect({
      signer,
      chainAddresses: config.chainAddresses,
      chainProviders: config.chainProviders,
      logger: pino(),
      messagingUrl: config.messagingUrl,
      authUrl: config.authUrl,
      natsUrl: config.natsUrl,
    });
    localStorage.setItem("publicIdentifier", signer.publicIdentifier);
    return this.browserNode;
  }

  private async handleIncomingMessage(e: MessageEvent) {
    if (e.origin !== this.parentOrigin) return;
    const request = safeJsonParse(e.data);
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

  private async handleRequest<T extends ChannelRpcMethod>(
    request: EngineParams.RpcRequest,
  ): Promise<ChannelRpcMethodsResponsesMap[T]> {
    if (request.method === "connext_authenticate") {
      const sig = request.params.signature;
      const node = await this.initNode(sig);
      return {
        publicIdentifier: node.publicIdentifier,
        signerAddress: node.signerAddress,
      } as ChannelRpcMethodsResponsesMap["connext_authenticate"];
    }
    if (typeof this.browserNode === "undefined") {
      throw new Error(
        "Channel provider not initialized within iframe app - ensure that connext_authenticate is called before any other commands",
      );
    }
    if (request.method === "chan_subscribe") {
      const subscription = utils.keccak256(utils.toUtf8Bytes(`${request.id}`));
      const listener = (data: any) => {
        const payload = constructRpcRequest<"chan_subscription">("chan_subscription", {
          subscription,
          data,
        });
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
    return await this.browserNode.send(request);
  }
}
