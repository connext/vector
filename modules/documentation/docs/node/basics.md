# Basics

A Connext node is an implementation of the Connext protocols. Anyone who is using Connext *in any way* should most likely be running a node.

Nodes take in the following:
- Access to a user key, from which a `ChannelSigner` can be created.
- etc.

There are two primary node implementations available right now, both written in Typescript:
- server-node
- browser-node

## Server-Node vs. Browser-Node

In general, nodes expose very similar interfaces and behave very similarly. There are a few notable differences, however:

|                       |                                               Server-Node                                              |                 Browser-Node                 |
|:---------------------:|:------------------------------------------------------------------------------------------------------:|:--------------------------------------------:|
|      Interface(s)     |                                              gRPC and REST                                             |                      typescript                      |
|      Distribution     |                                              Docker image                                              |                      npm                     |
| Environment Variables |                                  Passed in via `config-node.json` file                                 | Set via `.env` or passed in on instantiation |
|     Key Management    | Takes in a `mnemonic` and supports creating multiple signers by passing in an `index`. See more below. |       Takes in a single `ChannelSigner`      |

## Server-Node Specific Functionality

### Using the Server Node JS Client

The server-node's HTTP requests are wrapped into a JS [client](./modules/utils/src/serverNode.ts). This can be installed into a standalone Node.js program by installing the `@connext/vector-utils` package. Minimally, the client is instantiated like so (assuming a local setup similar to `make start-node` or `make start-duet`):

```ts
import { RestServerNodeService } from "@connext/vector-utils";
import pino from "pino";

const alice = await RestServerNodeService.connect("http://localhost:8001", pino(), undefined, 0);
```

The client has wrapper methods for the `server-node`'s REST interface, which implement the interface [`IServerNodeService`](./modules/utils/src/serverNode.ts).

Note: because the `browser-node` exposes a TS interface directly, there is no need to do this in the browser.

### Indexed Engines

In most cases, the `server-node` manages a single private key and signs all channel operations with this key. 

However, server-nodes *also* possess the ability to handle many different signers in the same stack concurrently. You can do this by specifying an `index` param in the `connect` method.

This functionality is possible in the `server-node` by deriving private keys from the mnemonic in the `server-node`'s config ([more info](https://medium.com/@wolovim/ethereum-201-hd-wallets-11d0c93c87f7)). By default, the `server-node` creates an engine at the index path "0" for convenience.

Below is an example of creating a new Engine instance. The `index` param is an integer between 0 and 2147483647 (2^32):

```http
POST {{aliceUrl}}/node
Content-Type: application/json

{
  "index": 1234
}
```

The response to this request contains a `signerAddress` and `publicIdentifier`. Additional calls to the server node must include the `publicIdentifier` to specify which `engine` to use.
