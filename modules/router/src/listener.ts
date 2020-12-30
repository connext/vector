import {
  EngineEvents,
  RouterSchemas,
  INodeService,
  ConditionalTransferCreatedPayload,
  FullChannelState,
  IVectorChainReader,
} from "@connext/vector-types";
import { Gauge, Registry } from "prom-client";
import Ajv from "ajv";
import { JsonRpcProvider } from "@ethersproject/providers";
import { BaseLogger } from "pino";

import { adjustCollateral, requestCollateral } from "./collateral";
import { forwardTransferCreation, forwardTransferResolution, handleIsAlive } from "./forwarding";
import { IRouterStore } from "./services/store";

const ajv = new Ajv();

export type ChainJsonProviders = {
  [k: string]: JsonRpcProvider;
};

const configureMetrics = (register: Registry) => {
  // Track number of times a payment was forwarded
  const attempts = new Gauge({
    name: "router_forwarded_payment_attempts",
    help: "router_forwarded_payment_attempts_help",
    labelNames: ["routingId"],
    registers: [register],
  });

  // Track successful forwards
  const successful = new Gauge({
    name: "router_successful_forwarded_payments",
    help: "router_successful_forwarded_payments_help",
    labelNames: ["routingId"],
    registers: [register],
  });

  // Track failing forwards
  const failed = new Gauge({
    name: "router_failed_forwarded_payments",
    help: "router_failed_forwarded_payments_help",
    labelNames: ["routingId"],
    registers: [register],
  });

  const activeTransfers = new Gauge({
    name: "router_active_transfers",
    help: "router_active_transfers_help",
    labelNames: ["channelAddress"],
    registers: [register],
  });

  const transferSendTime = new Gauge({
    name: "router_sent_payments_time",
    help: "router_sent_payments_time_help",
    labelNames: ["routingId"],
    registers: [register],
  });

  // Return the metrics so they can be incremented as needed
  return { failed, successful, attempts, activeTransfers, transferSendTime };
};

export async function setupListeners(
  routerPublicIdentifier: string,
  routerSignerAddress: string,
  nodeService: INodeService,
  store: IRouterStore,
  chainReader: IVectorChainReader,
  logger: BaseLogger,
  register: Registry,
): Promise<void> {
  // TODO, node should be wrapper around grpc
  const { failed, successful, attempts, activeTransfers, transferSendTime } = configureMetrics(register);

  // Set up listener to handle transfer creation
  nodeService.on(
    EngineEvents.CONDITIONAL_TRANSFER_CREATED,
    async (data: ConditionalTransferCreatedPayload) => {
      const meta = data.transfer.meta as RouterSchemas.RouterMeta;
      attempts.labels(meta.routingId).inc(1);
      const end = transferSendTime.labels(meta.routingId).startTimer();
      const res = await forwardTransferCreation(
        data,
        routerPublicIdentifier,
        routerSignerAddress,
        nodeService,
        store,
        logger,
        chainReader,
      );
      if (res.isError) {
        failed.labels(meta.routingId).inc(1);
        return logger.error(
          { method: "forwardTransferCreation", error: res.getError()?.message, context: res.getError()?.context },
          "Error forwarding transfer",
        );
      }
      end();
      successful.labels(meta.routingId).inc(1);
      activeTransfers.labels(data.channelAddress).set(data.activeTransferIds?.length ?? 0);
      logger.info({ method: "forwardTransferCreation", result: res.getValue() }, "Successfully forwarded transfer");
    },
    (data: ConditionalTransferCreatedPayload) => {
      // Only forward transfers with valid routing metas
      const meta = data.transfer.meta as RouterSchemas.RouterMeta;
      const validate = ajv.compile(RouterSchemas.RouterMeta);
      const valid = validate(meta);
      if (!valid) {
        logger.info(
          {
            transferId: data.transfer.transferId,
            routingId: meta.routingId,
            channelAddress: data.channelAddress,
            errors: validate.errors?.map((err) => err.message),
          },
          "Not forwarding non-routing transfer",
        );
        return false;
      }

      if (data.transfer.initiator === routerSignerAddress) {
        logger.info(
          { initiator: data.transfer.initiator },
          "Not forwarding transfer which was initiated by our node, doing nothing",
        );
        return false;
      }

      if (!meta.path[0].recipient || meta.path[0].recipient === routerPublicIdentifier) {
        logger.warn(
          { path: meta.path[0], publicIdentifier: routerPublicIdentifier },
          "Not forwarding transfer with no path to follow",
        );
        return false;
      }
      return true;
    },
  );

  // Set up listener to handle transfer resolution
  nodeService.on(
    EngineEvents.CONDITIONAL_TRANSFER_RESOLVED,
    async (data: ConditionalTransferCreatedPayload) => {
      const res = await forwardTransferResolution(
        data,
        routerPublicIdentifier,
        routerSignerAddress,
        nodeService,
        store,
        logger,
      );
      if (res.isError) {
        return logger.error(
          { method: "forwardTransferResolution", error: res.getError()?.message, context: res.getError()?.context },
          "Error forwarding resolution",
        );
      }
      logger.info({ method: "forwardTransferResolution", result: res.getValue() }, "Successfully forwarded resolution");

      // Adjust collateral in channel
      await adjustCollateral(
        data.channelAddress,
        data.transfer.assetId,
        routerPublicIdentifier,
        nodeService,
        chainReader,
        logger,
      );
    },
    (data: ConditionalTransferCreatedPayload) => {
      // Only forward transfers with valid routing metas
      const validate = ajv.compile(RouterSchemas.RouterMeta);
      const valid = validate(data.transfer.meta);
      if (!valid) {
        logger.info(
          {
            transferId: data.transfer.transferId,
            channelAddress: data.channelAddress,
            errors: validate.errors?.map((err) => err.message),
          },
          "Not forwarding non-routing transfer",
        );
        return false;
      }

      // If there is no resolver, do nothing
      if (!data.transfer.transferResolver) {
        logger.warn(
          {
            transferId: data.transfer,
            routingId: data.transfer.meta.routingId,
            channelAddress: data.transfer.channelAddress,
          },
          "No resolver found in transfer",
        );
        return false;
      }

      // If we are the receiver of this transfer, do nothing
      if (data.transfer.responder === routerSignerAddress) {
        logger.info({ routingId: data.transfer.meta.routingId }, "Nothing to reclaim");
        return false;
      }
      activeTransfers.labels(data.channelAddress).set(data.activeTransferIds?.length ?? 0);

      return true;
    },
  );

  nodeService.on(EngineEvents.REQUEST_COLLATERAL, async (data) => {
    logger.info({ data }, "Received request collateral event");
    const channelRes = await nodeService.getStateChannel({
      channelAddress: data.channelAddress,
      publicIdentifier: routerPublicIdentifier,
    });
    if (channelRes.isError) {
      logger.error(
        {
          channelAddress: data.channelAddress,
          error: channelRes.getError()?.message,
          context: channelRes.getError()?.context,
        },
        "Error requesting collateral",
      );
    }
    const channel = channelRes.getValue();
    if (!channel) {
      logger.error({ channelAddress: data.channelAddress }, "Error requesting collateral");
    }

    const res = await requestCollateral(
      channel as FullChannelState,
      data.assetId,
      routerPublicIdentifier,
      nodeService,
      chainReader,
      logger,
      data.amount,
    );
    if (res.isError) {
      logger.error({ error: res.getError()?.message, context: res.getError()?.context }, "Error requesting collateral");
      return;
    }

    logger.info({ res: res.getValue() }, "Succesfully requested collateral");
  });

  nodeService.on(EngineEvents.IS_ALIVE, async (data) => {
    const res = await handleIsAlive(
      data,
      routerPublicIdentifier,
      routerSignerAddress,
      nodeService,
      store,
      chainReader,
      logger,
    );
    if (res.isError) {
      logger.error({ error: res.getError()?.message, context: res.getError()?.context }, "Error handling isAlive");
      return;
    }

    logger.info({ res: res.getValue() }, "Succesfully handled isAlive");
  });
}
