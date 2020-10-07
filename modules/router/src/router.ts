import { BaseLogger } from "pino";
import { INodeService } from "@connext/vector-types";

import { setupListeners } from "./listener";
import { IRouterStore } from "./services/store";

export interface IRouter {
  startup(): Promise<void>;
}

export class Router implements IRouter {
  constructor(
    private readonly node: INodeService,
    private readonly store: IRouterStore,
    private readonly logger: BaseLogger,
  ) {}

  static async connect(node: INodeService, store: IRouterStore, logger: BaseLogger): Promise<Router> {
    const router = new Router(node, store, logger);
    await router.startup();
    logger.info("Vector Router connected 🚀");
    return router;
  }

  async startup(): Promise<void> {
    await setupListeners(this.node, this.store, this.logger);
  }
}
