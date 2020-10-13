import { BaseLogger } from "pino";
import { INodeService } from "@connext/vector-types";
import { Gauge, Registry } from "prom-client";

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
    });
    this.register.registerMetric(channelCounter);

    // Track the total number of payments
    const paymentCounter = new Gauge({
      name: "router_payments_total",
      help: "router_payments_total_help",
      labelNames: ["channelAddress"],
    });
    this.register.registerMetric(paymentCounter);

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

      for (const channelAddr of channelAddresses) {
        const payments = await this.service.getActiveTransfers({
          channelAddress: channelAddr,
          publicIdentifier: this.publicIdentifier,
        });
        if (payments.isError) {
          this.logger.error(
            { error: payments.getError()!.message, channelAddress: channelAddr },
            "Failed to get active payments",
          );
          return;
        }
        this.logger.info({ count: payments.getValue() }, "setting payments");
        paymentCounter.set({ channelAddress: channelAddr }, payments.getValue().length);
      }
      this.logger.info({}, "Done collecting metrics");
    }, 30_000);
  }
}
