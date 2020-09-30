import { EngineEvents, RouterSchemas } from "@connext/vector-types";
import { IServerNodeService } from "@connext/vector-utils";
import Ajv from "ajv";
import { BaseLogger } from "pino";

import { forwardTransferCreation, forwardTransferResolution } from "./forwarding";
import { IRouterStore } from "./services/store";

const ajv = new Ajv();

export async function setupListeners(node: IServerNodeService, store: IRouterStore, logger: BaseLogger): Promise<void> {
  // TODO, node should be wrapper around grpc
  // Set up listener to handle transfer creation
  await node.on(
    EngineEvents.CONDITIONAL_TRANSFER_CREATED,
    async data => {
      const res = await forwardTransferCreation(data, node, store, logger);
      if (res.isError) {
        return logger.error(
          { method: "forwardTransferCreation", error: res.getError()?.message, context: res.getError()?.context },
          "Error forwarding transfer",
        );
      }
      logger.info({ method: "forwardTransferCreation", result: res.getValue() }, "Successfully forwarded transfer");
    },
    data => {
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
      return true;
    },
  );

  // Set up listener to handle transfer resolution
  await node.on(
    EngineEvents.CONDITIONAL_TRANSFER_RESOLVED,
    async data => {
      await forwardTransferResolution(data, node, store, logger);
    },
    data => {
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
      return true;
    },
  );

  await node.on(
    EngineEvents.DEPOSIT_RECONCILED, // TODO types
    async data => {
      // await handleCollateralization(data);
    },
  );

  // node.on(
  //   EngineEvents.IS_ALIVE, // TODO types
  //   async data => {
  //     await handleIsAlive(data);
  //   },
  // );
}
