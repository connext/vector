import { BaseLogger } from "pino";
import { INodeService, IVectorChainReader } from "@connext/vector-types";
import { Registry } from "prom-client";

import { setupListeners } from "./listener";
import { IRouterStore } from "./services/store";
import { IRouterMessagingService } from "./services/messaging";

export interface IRouter {
  startup(): Promise<void>;
}

export class Router implements IRouter {
  constructor(
    private readonly publicIdentifier: string,
    private readonly signerAddress: string,
    private readonly nodeService: INodeService,
    private readonly chainReader: IVectorChainReader,
    private readonly store: IRouterStore,
    private readonly messagingService: IRouterMessagingService,
    private readonly logger: BaseLogger,
    private readonly register: Registry,
  ) {}

  static async connect(
    publicIdentifier: string,
    signerAddress: string,
    nodeService: INodeService,
    chainReader: IVectorChainReader,
    store: IRouterStore,
    messagingService: IRouterMessagingService,
    logger: BaseLogger,
    register: Registry,
  ): Promise<Router> {
    const router = new Router(
      publicIdentifier,
      signerAddress,
      nodeService,
      chainReader,
      store,
      messagingService,
      logger,
      register,
    );
    await router.startup();
    logger.info("Vector Router connected 🚀");
    return router;
  }

  async startup(): Promise<void> {
    await this.messagingService.connect();
    await setupListeners(
      this.publicIdentifier,
      this.signerAddress,
      this.nodeService,
      this.store,
      this.chainReader,
      this.messagingService,
      this.logger,
      this.register,
    );
  }
}
