import { BaseLogger } from "pino";
import { INodeService, IVectorChainReader, IChannelSigner, ChainAddresses } from "@connext/vector-types";

import { setupListeners } from "./listener";
import { IRouterStore } from "./services/store";
import { IRouterMessagingService } from "./services/messaging";

export interface IRouter {
  startup(): Promise<void>;
}

export class Router implements IRouter {
  constructor(
    private readonly signer: IChannelSigner,
    private readonly chainAddresses: ChainAddresses,
    private readonly nodeService: INodeService,
    private readonly chainReader: IVectorChainReader,
    private readonly store: IRouterStore,
    private readonly messagingService: IRouterMessagingService,
    private readonly logger: BaseLogger,
  ) {}

  static async connect(
    signer: IChannelSigner,
    chainAddresses: ChainAddresses,
    nodeService: INodeService,
    chainReader: IVectorChainReader,
    store: IRouterStore,
    messagingService: IRouterMessagingService,
    logger: BaseLogger,
  ): Promise<Router> {
    const router = new Router(signer, chainAddresses, nodeService, chainReader, store, messagingService, logger);
    await router.startup();
    logger.info("Vector Router connected 🚀");
    return router;
  }

  async startup(): Promise<void> {
    await this.messagingService.connect();
    await setupListeners(
      this.signer,
      this.chainAddresses,
      this.nodeService,
      this.store,
      this.chainReader,
      this.messagingService,
      this.logger,
    );
  }
}
