import { ChannelSigner, getRandomChannelSigner, createVectorChannelMessage } from "@connext/vector-utils";
import {
  // JsonRpcProvider,
  IEngineStore,
  IMessagingService,
  FullChannelState,
  ChannelUpdateError,
} from "@connext/vector-types";
import { Evt } from "evt";
import { expect } from "chai";

import { inbound } from "../sync";

import { config } from "./services/config";
import { MemoryStoreService } from "./services/store";
import { MemoryMessagingService } from "./services/messaging";

describe("inbound", () => {
  const chainProviders = config.chainProviders;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [chainIdStr, providerUrl] = Object.entries(chainProviders)[0] as string[];
  // const provider = new JsonRpcProvider(providerUrl);
  const stateEvt = new Evt<FullChannelState>();
  const errorEvt = new Evt<ChannelUpdateError>();

  let signers: ChannelSigner[];
  let store: IEngineStore;
  let messaging: IMessagingService;
  // let linkedTransferDefinition: string;

  beforeEach(async () => {
    signers = Array(2)
      .fill(0)
      .map((v) => getRandomChannelSigner(providerUrl));
    store = new MemoryStoreService();
    messaging = new MemoryMessagingService();
    // linkedTransferDefinition = global["networkContext"].linkedTransferDefinition;
  });

  it("should return undefined if message is from us", async () => {
    const message = createVectorChannelMessage({ from: signers[0].publicIdentifier });
    const res = await inbound(message, store, messaging, signers[0], chainProviders, stateEvt, errorEvt);
    expect(res.isError).to.be.false;
    expect(res.getValue()).to.be.undefined;
  });

});

