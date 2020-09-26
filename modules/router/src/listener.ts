import { EngineEvents } from "@connext/vector-types";
import { BaseLogger } from "pino";

import { forwardTransferCreation, forwardTransferResolution } from "./forwarding";
import { IServerNodeService } from "./services/server-node";
import { IRouterStore } from "./services/store";

export async function setupListeners(node: IServerNodeService, store: IRouterStore, logger: BaseLogger): Promise<void> {
  // TODO, node should be wrapper around grpc
  // Set up listener to handle transfer creation
  node.on(
    EngineEvents.CONDITIONAL_TRANFER_CREATED, // TODO types
    async data => {
      await forwardTransferCreation(data, node, store, logger);
    },
  );

  // Set up listener to handle transfer resolution
  node.on(
    EngineEvents.CONDITIONAL_TRANSFER_RESOLVED, // TODO types
    async data => {
      await forwardTransferResolution(data, node, store, logger);
    },
  );

  node.on(
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
