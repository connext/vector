import { BrowserNode, NonEIP712Message } from "@connext/vector-browser-node";
import {
  ChainAddresses,
  ChainProviders,
  ChannelRpcMethod,
  ChannelRpcMethodsResponsesMap,
  EngineParams,
  jsonifyError,
} from "@connext/vector-types";
import { ChannelSigner, constructRpcRequest, safeJsonParse } from "@connext/vector-utils";
import { hexlify } from "@ethersproject/bytes";
import { entropyToMnemonic } from "@ethersproject/hdnode";
import { keccak256 } from "@ethersproject/keccak256";
import { randomBytes } from "@ethersproject/random";
import { toUtf8Bytes } from "@ethersproject/strings";
import { Wallet, verifyMessage } from "@ethersproject/wallet";
import { BigNumber } from "@ethersproject/bignumber";
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

  private async initNode(
    chainProviders: { [chainId: number]: string },
    chainAddresses?: ChainAddresses,
    messagingUrl?: string,
    signature?: string,
    signerAddress?: string,
    natsUrl?: string,
    authUrl?: string,
  ): Promise<BrowserNode> {
    console.log(`initNode params: `, {
      chainProviders,
      chainAddresses,
      messagingUrl,
      signature,
      signerAddress,
      natsUrl,
      authUrl,
    });
    // store entropy in local storage
    if (!localStorage) {
      throw new Error("localStorage not available in this window, please enable cross-site cookies and try again.");
    }
    if (!signature) {
      throw new Error("Signature is required");
    }
    const recovered = verifyMessage(NonEIP712Message, signature);
    if (recovered !== signerAddress) {
      throw new Error(
        `Signature not properly recovered. expected ${signerAddress}, got ${recovered}, signature: ${signature}`,
      );
    }

    let _messagingUrl = messagingUrl ?? config.messagingUrl;
    let _authUrl = authUrl ?? config.authUrl;
    let _natsUrl = natsUrl ?? config.natsUrl;

    // convert to use messaging cluster
    if (_messagingUrl === "https://messaging.connext.network") {
      console.warn("Using deprecated messaging URL, converting to new URL");
      _authUrl = "https://messaging.connext.network";
      _natsUrl = "wss://websocket.connext.provide.network";
      _messagingUrl = undefined;
    }

    let storedEntropy = localStorage.getItem("entropy");
    storedEntropy = storedEntropy ?? signature;

    // if the entropy stored in localstorage is different than the signature, try to move over to the new
    // deterministic private key
    if (storedEntropy !== signature) {
      // need to migrate
      const ableToMigrate = await this.ableToMigrate(
        storedEntropy,
        chainAddresses ?? config.chainAddresses,
        chainProviders,
        _messagingUrl,
        _authUrl,
        _natsUrl,
      );
      if (ableToMigrate) {
        storedEntropy = signature;
      }
    }
    localStorage.setItem("entropy", storedEntropy);

    // use the entropy of the signature to generate a private key for this wallet
    // since the signature depends on the private key stored by Magic/Metamask, this is not forgeable by an adversary
    const mnemonic = entropyToMnemonic(keccak256(storedEntropy));
    const privateKey = Wallet.fromMnemonic(mnemonic).privateKey;
    const signer = new ChannelSigner(privateKey);

    // check stored public identifier, and log a warning
    const storedPublicIdentifier = localStorage.getItem("publicIdentifier");
    if (storedPublicIdentifier && storedPublicIdentifier !== signer.publicIdentifier) {
      console.warn("Public identifier does not match what is in storage, new store will be created");
    }

    this.browserNode = await BrowserNode.connect({
      signer,
      chainAddresses: chainAddresses ?? config.chainAddresses,
      chainProviders,
      logger: pino(),
      messagingUrl: _messagingUrl,
      authUrl: _authUrl,
      natsUrl: _natsUrl,
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
      console.error(jsonifyError(e));
      response = { id: request.id, error: jsonifyError(e) };
    }
    window.parent.postMessage(JSON.stringify(response), this.parentOrigin);
  }

  private async handleRequest<T extends ChannelRpcMethod>(
    request: EngineParams.RpcRequest,
  ): Promise<ChannelRpcMethodsResponsesMap[T]> {
    if (request.method === "connext_authenticate") {
      const node = await this.initNode(
        request.params.chainProviders,
        request.params.chainAddresses,
        request.params.messagingUrl,
        request.params.signature,
        request.params.signer,
        request.params.natsUrl,
        request.params.authUrl,
      );
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

  // if the browser has a random key, we should move it to a deterministic key
  // we need to check if any of the channels in the store have balance in the channel or the transfers
  // if not, it is safe to migrate. if so, keep using the random key
  private async ableToMigrate(
    storedEntropy: string,
    chainAddresses: ChainAddresses,
    chainProviders: ChainProviders,
    messagingUrl?: string,
    authUrl?: string,
    natsUrl?: string,
  ): Promise<boolean> {
    console.warn("Checking if local storage can be migrated to deterministic key");
    const mnemonic = entropyToMnemonic(keccak256(storedEntropy));
    const privateKey = Wallet.fromMnemonic(mnemonic).privateKey;
    const signer = new ChannelSigner(privateKey);

    const browserNode = await BrowserNode.connect({
      signer,
      chainAddresses,
      chainProviders,
      logger: pino(),
      messagingUrl,
      authUrl,
      natsUrl,
    });

    const channelAddressesRes = await browserNode.getStateChannels();
    if (channelAddressesRes.isError) {
      throw channelAddressesRes.getError();
    }
    const channelAddresses = channelAddressesRes.getValue();
    const channelsWithBalance = await Promise.all(
      channelAddresses.map(async (channelAddress) => {
        const channel = await browserNode.getStateChannel({ channelAddress });
        if (channel.isError) {
          throw channel.getError();
        }
        const chan = channel.getValue();
        const hasBalance = chan?.balances.find((balance) => {
          // this checks both alice and bob balance
          if (BigNumber.from(balance.amount[0]).gt(0) || BigNumber.from(balance.amount[1]).gt(0)) {
            console.warn("Found channel with balance: ", chan);
            return true;
          }
          return false;
        });

        const activeTransfers = await browserNode.getActiveTransfers({ channelAddress });
        if (activeTransfers.isError) {
          throw activeTransfers.getError();
        }
        const hasTransfers = activeTransfers.getValue().find((transfer) => {
          if (BigNumber.from(transfer.balance.amount[0]).gt(0) || BigNumber.from(transfer.balance.amount[1]).gt(0)) {
            console.warn("Found transfer with balance: ", chan);
            return true;
          }
          return false;
        });

        if (hasBalance || hasTransfers) {
          return chan;
        }
        return undefined;
      }),
    );
    const channelsWithBalanceFiltered = channelsWithBalance.filter((chan) => !!chan);

    if (channelsWithBalanceFiltered.length === 0) {
      console.log("No channels with balance found");
      return true;
    }
    console.warn("Channels with balance exist, cannot migrate right now", channelsWithBalanceFiltered);
    return false;
  }
}
