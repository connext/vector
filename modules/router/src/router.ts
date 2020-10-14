import { BaseLogger } from "pino";
import { INodeService } from "@connext/vector-types";
import { Gauge, Registry } from "prom-client";

import { setupListeners } from "./listener";
import { IRouterStore } from "./services/store";
import { BigNumber, utils } from "ethers";

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
    private readonly register: Registry,
  ) {}

  static async connect(
    publicIdentifier: string,
    signerAddress: string,
    service: INodeService,
    store: IRouterStore,
    logger: BaseLogger,
    register: Registry,
  ): Promise<Router> {
    const router = new Router(publicIdentifier, signerAddress, service, store, logger, register);
    await router.startup();
    logger.info("Vector Router connected 🚀");
    return router;
  }

  async startup(): Promise<void> {
    await setupListeners(
      this.publicIdentifier,
      this.signerAddress,
      this.service,
      this.store,
      this.logger,
      this.register,
    );
    this.configureMetrics();
  }

  private configureMetrics() {
    // Track the total number of channels
    const channelCounter = new Gauge({
      name: "router_channels_total",
      help: "router_channels_total_help",
      registers: [this.register],
    });

    const collateral = new Gauge({
      name: "router_channels_collateral",
      help: "router_channels_collateral_help",
      labelNames: ["assetId", "channelAddress"],
      registers: [this.register],
    });

    // TODO: fix this once this issue is fixed by using the `collect` function in the gauge
    // https://github.com/siimon/prom-client/issues/383
    setInterval(async () => {
      this.logger.info({}, "Collecting metrics");
      const channels = await this.service.getStateChannels({ publicIdentifier: this.publicIdentifier });
      if (channels.isError) {
        this.logger.error(
          { error: channels.getError()!.message, publicIdentifier: this.publicIdentifier },
          "Failed to fetch channels",
        );
        return;
      }
      const channelAddresses = channels.getValue();
      channelCounter.set(channelAddresses.length);
      this.logger.info({}, "Done collecting metrics");
    }, 30_000);
  }
}
