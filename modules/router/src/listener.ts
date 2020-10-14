import {
  EngineEvents,
  RouterSchemas,
  INodeService,
  ConditionalTransferCreatedPayload,
  DepositReconciledPayload,
  FullChannelState,
} from "@connext/vector-types";
import { Gauge, Histogram, Registry } from "prom-client";
import Ajv from "ajv";
import { providers } from "ethers";
import { BaseLogger } from "pino";

import { requestCollateral } from "./collateral";
import { config } from "./config";
import { forwardTransferCreation, forwardTransferResolution } from "./forwarding";
import { IRouterStore } from "./services/store";

const ajv = new Ajv();

export type ChainJsonProviders = {
  [k: string]: providers.JsonRpcProvider;
};
const chainProviders: ChainJsonProviders = Object.entries(config.chainProviders).reduce((acc, [chainId, url]) => {
  acc[chainId] = new providers.JsonRpcProvider(url);
  return acc;
}, {} as ChainJsonProviders);

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
  publicIdentifier: string,
  signerAddress: string,
  nodeService: INodeService,
  store: IRouterStore,
  logger: BaseLogger,
  register: Registry,
): Promise<void> {
  // TODO, node should be wrapper around grpc
  const { failed, successful, attempts, activeTransfers, transferSendTime } = configureMetrics(register);

  // Set up listener to handle transfer creation
  await nodeService.on(
    EngineEvents.CONDITIONAL_TRANSFER_CREATED,
    async (data: ConditionalTransferCreatedPayload) => {
      const meta = data.transfer.meta as RouterSchemas.RouterMeta;
      attempts.labels(meta.routingId).inc(1);
      const end = transferSendTime.labels(meta.routingId).startTimer();
      const res = await forwardTransferCreation(
        data,
        publicIdentifier,
        signerAddress,
        nodeService,
        store,
        logger,
        chainProviders,
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
            errors: validate.errors?.map(err => err.message),
          },
          "Not forwarding non-routing transfer",
        );
        return false;
      }

      if (data.transfer.initiator === signerAddress) {
        logger.info(
          { initiator: data.transfer.initiator },
          "Not forwarding transfer which was initiated by our node, doing nothing",
        );
        return false;
      }

      if (!meta.path[0].recipient || meta.path[0].recipient === publicIdentifier) {
        logger.warn({ path: meta.path[0], publicIdentifier }, "Not forwarding transfer with no path to follow");
        return false;
      }
      return true;
    },
  );

  // Set up listener to handle transfer resolution
  await nodeService.on(
    EngineEvents.CONDITIONAL_TRANSFER_RESOLVED,
    async (data: ConditionalTransferCreatedPayload) => {
      const res = await forwardTransferResolution(data, publicIdentifier, signerAddress, nodeService, store, logger);
      if (res.isError) {
        return logger.error(
          { method: "forwardTransferResolution", error: res.getError()?.message, context: res.getError()?.context },
          "Error forwarding resolution",
        );
      }
      logger.info({ method: "forwardTransferResolution", result: res.getValue() }, "Successfully forwarded resolution");
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
            errors: validate.errors?.map(err => err.message),
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
      if (data.transfer.responder === signerAddress) {
        logger.info({ routingId: data.transfer.meta.routingId }, "Nothing to reclaim");
        return false;
      }
      activeTransfers.labels(data.channelAddress).set(data.activeTransferIds?.length ?? 0);

      return true;
    },
  );

  await nodeService.on(EngineEvents.REQUEST_COLLATERAL, async data => {
    logger.info({ data }, "Received request collateral event");
    const channelRes = await nodeService.getStateChannel({ channelAddress: data.channelAddress, publicIdentifier });
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
    const channel: FullChannelState = channelRes.getValue();
    if (!channel) {
      logger.error({ channelAddress: data.channelAddress }, "Error requesting collateral");
    }

    const res = await requestCollateral(
      channel,
      data.assetId,
      publicIdentifier,
      nodeService,
      chainProviders,
      logger,
      data.amount,
    );
    if (res.isError) {
      logger.error({ error: res.getError()?.message, context: res.getError()?.context }, "Error requesting collateral");
      return;
    }

    logger.info({ res: res.getValue() }, "Succesfully requested collateral");
  });

  // await nodeService.on(
  //   EngineEvents.IS_ALIVE, // TODO types
  //   async data => {
  //     await handleIsAlive(data);
  //   },
  // );
}
