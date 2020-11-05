import EventEmitter from "eventemitter3";
import {
  ChannelRpcMethod,
  EngineEvent,
  ChannelRpcMethods,
  EngineEvents,
  EngineEventMap,
  IVectorEngine,
  EngineParams,
} from "@connext/vector-types";
import { constructRpcRequest } from "@connext/vector-utils";

export function isEventName(event: string): event is EngineEvent {
  return event in EngineEvents;
}

export function isMethodName(event: string): event is ChannelRpcMethod {
  return event in ChannelRpcMethods;
}

export interface IframeOptions {
  id: string;
  src: string;
}

export function payloadId(): number {
  const date = new Date().getTime() * Math.pow(10, 3);
  const extra = Math.floor(Math.random() * Math.pow(10, 3));
  return date + extra;
}

export interface IRpcChannelProvider {
  connected: boolean;
  send(payload: EngineParams.RpcRequest): Promise<any>;
  open(): Promise<void>;
  close(): Promise<void>;
  on<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter?: (payload: EngineEventMap[T]) => boolean,
  ): Promise<void>;
  once<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter?: (payload: EngineEventMap[T]) => boolean,
  ): Promise<void>;
}

export class IframeChannelProvider extends EventEmitter<string> implements IRpcChannelProvider {
  public iframe: HTMLIFrameElement | undefined;
  public opts: IframeOptions;
  public connected = false;

  private subscribed = false;
  private events = new EventEmitter<string>();

  constructor(opts: IframeOptions) {
    super();
    this.opts = opts;
    if (document.readyState === "loading") {
      window.addEventListener("DOMContentLoaded", () => {
        this.open();
      });
    } else {
      this.open();
    }
  }

  open(): Promise<void> {
    throw new Error("Method not implemented.");
  }

  close(): Promise<void> {
    throw new Error("Method not implemented.");
  }

  public send(rpc: EngineParams.RpcRequest): Promise<any> {
    return new Promise((resolve, reject) => {
      if (typeof this.iframe === "undefined") {
        throw new Error("iframe is not rendered!");
      }
      if (this.iframe.contentWindow === null) {
        throw new Error("iframe inner page not loaded!");
      }
      this.events.on(`${rpc.id}`, response => {
        if (response?.result) {
          resolve(response?.result);
        } else {
          if (response?.error?.message) {
            reject(new Error(response.error.message));
          } else {
            reject(new Error(`Failed request for method: ${rpc.method}`));
          }
        }
      });
      this.iframe.contentWindow.postMessage(JSON.stringify(rpc), this.iframe.src);
    });
  }

  public on = (event: string | ChannelRpcMethod | EngineEvent, listener: (...args: any[]) => void): any => {
    if (isEventName(event) || isMethodName(event)) {
      const rpc: EngineParams.RpcRequest = {
        id: Date.now(),
        jsonrpc: "2.0",
        method: "chan_subscribe",
        params: {
          event,
          once: false,
        },
      };
      return this.send(rpc).then(id => {
        this.events.on(id, listener);
      });
    }
    return this.events.on(event, listener);
  };

  public once = (event: string | ChannelRpcMethod | EngineEvent, listener: (...args: any[]) => void): any => {
    if (isEventName(event) || isMethodName(event)) {
      const rpc: EngineParams.RpcRequest = {
        id: Date.now(),
        jsonrpc: "2.0",
        method: "chan_subscribe",
        params: { event, once: true },
      };
      return this.send(rpc).then(id => {
        this.events.once(id, listener);
      });
    }
    return this.events.once(event, listener);
  };

  public removeAllListeners = (): any => {
    this.events.removeAllListeners();
    const rpc: EngineParams.RpcRequest = {
      id: Date.now(),
      jsonrpc: "2.0",
      method: "chan_unsubscribeAll",
      params: undefined,
    };
    return this.send(rpc);
  };

  public async unrender(): Promise<void> {
    if (typeof this.iframe === "undefined") {
      return Promise.resolve();
    }
    try {
      window.document.body.removeChild(this.iframe);
    } finally {
      this.iframe = undefined;
    }
  }

  public handleIncomingMessages(e: MessageEvent): void {
    const iframeOrigin = new URL(this.opts.src).origin;
    if (e.origin === iframeOrigin) {
      if (typeof e.data !== "string") {
        throw new Error(`Invalid incoming message data:${e.data}`);
      }
      if (e.data.startsWith("event:")) {
        const event = e.data.replace("event:", "");
        this.events.emit(event);
      } else {
        const payload = JSON.parse(e.data);
        if (payload.method === "chan_subscription") {
          const { subscription, data } = payload.params;
          this.events.emit(subscription, data);
        } else {
          this.events.emit(`${payload.id}`, payload);
        }
      }
    }
  }

  public subscribe(): void {
    if (this.subscribed) {
      return;
    }
    this.subscribed = true;
    window.addEventListener("message", this.handleIncomingMessages.bind(this));
  }

  public unsubscribe(): void {
    if (!this.subscribed) {
      return;
    }
    this.subscribed = false;
    window.removeEventListener("message", this.handleIncomingMessages.bind(this));
  }

  private onConnect() {
    this.connected = true;
    this.events.emit("connect");
    this.events.emit("open");
  }

  private onDisconnect() {
    this.connected = false;
    this.events.emit("disconnect");
    this.events.emit("close");
  }
}

export class DirectProvider implements IRpcChannelProvider {
  public connected = false;
  constructor(private readonly engine: IVectorEngine) {}
  async send(payload: EngineParams.RpcRequest): Promise<any> {
    const rpc = constructRpcRequest(payload.method as any, payload.params);
    const res = await this.engine.request(rpc);
    return res;
  }

  open(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  close(): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async on<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter?: (payload: EngineEventMap[T]) => boolean,
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async once<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter?: (payload: EngineEventMap[T]) => boolean,
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
}

// export class IframeChannelProvider extends ChannelProvider {
//   constructor(opts: IframeOptions) {
//     super(new IframeRpcConnection(opts));
//   }
//   get isIframe(): boolean {
//     return true;
//   }
// }
