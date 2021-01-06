import { BrowserNode } from "@connext/vector-browser-node";
import { ChannelRpcMethod, ChannelRpcMethodsResponsesMap, EngineParams } from "@connext/vector-types";
import { ChannelSigner, constructRpcRequest, safeJsonParse } from "@connext/vector-utils";
import { hexlify } from "@ethersproject/bytes";
import { entropyToMnemonic } from "@ethersproject/hdnode";
import { keccak256 } from "@ethersproject/keccak256";
import { randomBytes } from "@ethersproject/random";
import { toUtf8Bytes } from "@ethersproject/strings";
import { Wallet } from "@ethersproject/wallet";
import pino from "pino";
import { config } from "./config";

export default class ConnextManager {
  private parentOrigin: string;
  private browserNode: BrowserNode | undefined;

  constructor() {
    this.parentOrigin = new URL(document.referrer).origin;
    window.addEventListener("message", (e) => this.handleIncomingMessage(e), true);
    if (document.readyState === "loading") {
      window.addEventListener("DOMContentLoaded", () => {
        window.parent.postMessage("event:iframe-initialized", this.parentOrigin as string);
      });
    } else {
      window.parent.postMessage("event:iframe-initialized", this.parentOrigin);
    }
  }

  private async initNode(chainProviders: { [chainId: number]: string }): Promise<BrowserNode> {
    // store entropy in local storage
    if (!localStorage) {
      throw new Error("localStorage not available in this window, please enable cross-site cookies and try again.");
    }
    let storedEntropy = localStorage.getItem("entropy");
    if (!storedEntropy) {
      storedEntropy = hexlify(randomBytes(65));
      localStorage.setItem("entropy", storedEntropy);
    }

    // use the entropy of the signature to generate a private key for this wallet
    // since the signature depends on the private key stored by Magic/Metamask, this is not forgeable by an adversary
    const mnemonic = entropyToMnemonic(keccak256(storedEntropy));
    const privateKey = Wallet.fromMnemonic(mnemonic).privateKey;
    const signer = new ChannelSigner(privateKey);

    // store publicIdentifier in local storage to see if indexedDB needs to be deleted
    const storedPublicIdentifier = localStorage.getItem("publicIdentifier");
    if (storedPublicIdentifier && storedPublicIdentifier !== signer.publicIdentifier) {
      console.warn("Public identifier does not match what is in storage, deleting store...");
      indexedDB.deleteDatabase("VectorIndexedDBDatabase");
    }

    this.browserNode = await BrowserNode.connect({
      signer,
      chainAddresses: config.chainAddresses,
      chainProviders,
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
      const node = await this.initNode(request.params.chainProviders);
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
      const subscription = keccak256(toUtf8Bytes(`${request.id}`));
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
