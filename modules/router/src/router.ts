import { BaseLogger } from "pino";
import { IMessagingService, INodeService, IVectorChainReader } from "@connext/vector-types";
import { Registry } from "prom-client";

import { setupListeners } from "./listener";
import { IRouterStore } from "./services/store";

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
    private readonly messagingService: IMessagingService,
    private readonly logger: BaseLogger,
    private readonly register: Registry,
  ) {}

  static async connect(
    publicIdentifier: string,
    signerAddress: string,
    nodeService: INodeService,
    chainReader: IVectorChainReader,
    store: IRouterStore,
    messagingService: IMessagingService,
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
    this.configureMetrics();
  }

  private configureMetrics() {
    // // Track the total number of channels
    // const channelCounter = new Gauge({
    //   name: "router_channels_total",
    //   help: "router_channels_total_help",
    //   registers: [this.register],
    // });
    // const collateral = new Gauge({
    //   name: "router_channels_collateral",
    //   help: "router_channels_collateral_help",
    //   labelNames: ["assetId", "channelAddress"],
    //   registers: [this.register],
    // });
    // // TODO: fix this once this issue is fixed by using the `collect` function in the gauge
    // // https://github.com/siimon/prom-client/issues/383
    // setInterval(async () => {
    //   this.logger.debug({}, "Collecting metrics");
    //   const channels = await this.nodeService.getStateChannels({ publicIdentifier: this.publicIdentifier });
    //   if (channels.isError) {
    //     this.logger.error(
    //       { error: channels.getError()!.message, publicIdentifier: this.publicIdentifier },
    //       "Failed to fetch channels",
    //     );
    //     return;
    //   }
    //   const channelAddresses = channels.getValue();
    //   channelCounter.set(channelAddresses.length);
    //   for (const channelAddr of channelAddresses) {
    //     const channelState = await this.nodeService.getStateChannel({
    //       channelAddress: channelAddr,
    //       publicIdentifier: this.publicIdentifier,
    //     });
    //     if (channelState.isError) {
    //       this.logger.error(
    //         { error: channelState.getError()!.message, channelAddress: channelAddr },
    //         "Failed to get channel",
    //       );
    //       return;
    //     }
    //     const { balances, assetIds, aliceIdentifier } = channelState.getValue() as FullChannelState;
    //     assetIds.forEach((assetId: string, index: number) => {
    //       const balance = balances[index];
    //       if (!balance) {
    //         return;
    //       }
    //       // Set the proper collateral gauge
    //       collateral.set(
    //         { assetId, channelAddress: channelAddr },
    //         parseFloat(formatEther(balance.amount[this.publicIdentifier === aliceIdentifier ? 0 : 1])),
    //       );
    //     });
    //   }
    //   this.logger.debug({}, "Done collecting metrics");
    // }, 30_000);
  }
}
