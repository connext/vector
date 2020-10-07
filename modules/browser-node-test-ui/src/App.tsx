import { BrowserNode } from "@connext/browser-node";
import { getRandomChannelSigner } from "@connext/vector-utils";
import React, { useEffect, useState } from "react";
import pino from "pino";

import logo from "./logo.svg";
import "./App.css";
import { config } from "./config";
import { INodeService } from "../../utils/node_modules/@connext/vector-types/dist/src";

const logger = pino();
const signer = getRandomChannelSigner();
console.log(`Using random channel signer ${signer.publicIdentifier}`);

function App() {
  const [node, setNode] = useState<BrowserNode>();
  const [connectError, setConnectError] = useState<string>();
  useEffect(() => {
    const init = async () => {
      console.log(config);
      try {
        const client = await BrowserNode.connect(
          config.natsUrl,
          logger,
          signer,
          config.authUrl,
          config.chainProviders,
          config.chainAddresses,
        );
        setNode(client);
      } catch (e) {
        setConnectError(e.message);
      }
    };
    init();
  }, []);
  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          {node?.publicIdentifier
            ? `Node with publicIdentifier ${node?.publicIdentifier} connected`
            : connectError
            ? `Error connecting node: ${connectError}`
            : "Loading..."}
        </p>
      </header>
    </div>
  );
}

export default App;
