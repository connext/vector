import { EngineEvents } from "@connext/vector-types";
import { BaseLogger } from "pino";

import { forwardTransferCreation, forwardTransferResolution } from "./forwarding";
import { IServerNodeService } from "./services/server-node";
import { IRouterStore } from "./services/store";

export async function setupListeners(node: IServerNodeService, store: IRouterStore, logger: BaseLogger): Promise<void> {
  // TODO, node should be wrapper around grpc
  // Set up listener to handle transfer creation
  await node.on(
    EngineEvents.CONDITIONAL_TRANSFER_CREATED, // TODO types
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
  );

  // Set up listener to handle transfer resolution
  await node.on(
    EngineEvents.CONDITIONAL_TRANSFER_RESOLVED, // TODO types
    async data => {
      await forwardTransferResolution(data, node, store, logger);
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
