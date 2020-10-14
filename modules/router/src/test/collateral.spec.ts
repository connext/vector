import {
  createTestChannelState,
  getRandomIdentifier,
  hydrateProviders,
  RestServerNodeService,
} from "@connext/vector-utils";
import Sinon from "sinon";
import pino from "pino";
import { constants } from "ethers";
import { INodeService } from "@connext/vector-types";

import { config } from "../config";
import { requestCollateral } from "../collateral";

const logger = pino({ level: config.logLevel });
const hydratedProviders = hydrateProviders(config.chainProviders);

describe("Collateral", () => {
  let node: Sinon.SinonStubbedInstance<RestServerNodeService>;

  beforeEach(async () => {
    node = Sinon.createStubInstance(RestServerNodeService);
  });

  afterEach(() => {
    Sinon.restore();
    Sinon.reset();
  });

  it("should request collateral without a target", async () => {
    const identifier = getRandomIdentifier();
    const channel = createTestChannelState("create");
    requestCollateral(channel, constants.AddressZero, identifier, node as INodeService, hydratedProviders, logger);
  });
});
