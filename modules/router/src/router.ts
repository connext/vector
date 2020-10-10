import { BaseLogger } from "pino";
import { INodeService } from "@connext/vector-types";

import { setupListeners } from "./listener";
import { IRouterStore } from "./services/store";

export interface IRouter {
  startup(): Promise<void>;
}

export class Router implements IRouter {
  constructor(
    private readonly publicIdentifier: string,
    private readonly signerAddress: string,
    private readonly service: INodeService,
    private readonly store: IRouterStore,
    private readonly logger: BaseLogger,
  ) {}

  static async connect(
    publicIdentifier: string,
    signerAddress: string,
    service: INodeService,
    store: IRouterStore,
    logger: BaseLogger,
  ): Promise<Router> {
    const router = new Router(publicIdentifier, signerAddress, service, store, logger);
    await router.startup();
    logger.info("Vector Router connected 🚀");
    return router;
  }

  async startup(): Promise<void> {
    await setupListeners(this.publicIdentifier, this.signerAddress, this.service, this.store, this.logger);
  }
}
