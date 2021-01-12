# Configuring and Deploying a Routing Vector Node

This guide will take you through the e2e process of configuring and deploying a router.

## Machine Setup

!!! Info
    If you're planning to launch an instance on your local machine or to a non-Ubuntu OS, you can skip this section and instead install the following dependencies yourself:
    - `make`: Probably already installed, otherwise install w `brew install make` or `apt install make` or similar.
    - `jq`: Probably not installed yet, install w `brew install jq` or `apt install jq` or similar.
    - `docker`: See the [docker website](https://www.docker.com/) for installation instructions.

First step: get a server via AWS or DigitalOcean or setup some hardware at home. For best results, use the most recent LTS version of Ubuntu & make sure it has at least 32GB of disk space. Note this new server's IP address (we'll call this `$SERVER_IP`). Make sure it's able to connect to the internet via ports 80, 443, 4221, and 4222 (no action required on DigitalOcean, Security Group config needs to be setup properly on AWS).

We won't need to ssh into this server right away, most of the setup will be done locally. Start by cloning the repo to your local machine if you haven't already and `cd` into it.

```bash
git clone git@github.com:connext/vector.git
cd vector
```

Every Vector node needs access to a hot wallet, you should generate a fresh mnemonic for your node's wallet that isn't used anywhere else. You can generate a new mnemonic from a node console with ethers by doing something like this: `require('ethers').Wallet.createRandom()`. Alternatively, you can generate one [here](https://iancoleman.io/bip39/).

!!! Warning
    We have a mnemonic hardcoded throughout our repo which is great to use in local testnets: `candy maple ... sweet treat`. If you try to use this mnemonic on a public testnet, it's possible that someone else is trying to use it at the same time. In the case where two nodes try to use the same mnemonic, vector will fail in unpredictable ways. To avoid encountering hard to debug errors, make sure you are using a private mnemonic that only you know, even on testnets.

Save this mnemonic somewhere safe and copy it to your clipboard. From your local machine, run:

```bash
SSH_KEY=$HOME/.ssh/id_rsa bash ops/server-setup.sh $SERVER_IP
```

!!! Info
    `$HOME/.ssh/id_rsa` is the default `SSH_KEY`, if this is the key you'll use to access `$SERVER_IP` then you don't need to supply it explicitly

The script should automatically do the following tasks to set up the environment:

1. Install all required dependencies.
2. Securely store your mnemonic as a [docker secret](https://docs.docker.com/engine/swarm/secrets/)
3. Clone the Vector repo

This script is idempotent which means you can run it over and over again w/out causing any problems. In fact, re-running it every month or so will help keep things up-to-date (you can skip inputting the mnemonic on subsequent runs).

For convenience's sake, we recommend adding an entry to your ssh config to easily access this server. Add something that looks like the following to `$HOME/.ssh/config`:

```bash
Host new-vector
  Hostname $SERVER_IP
  User ubuntu
  IdentityFile ~/.ssh/id_rsa
  ServerAliveInterval 120
```

Now you can login to your new server with just `ssh new-vector`.

## Contract Deployment

Before moving any further, you should first ensure that the required Vector contracts are deployed to your chain.

!!! Info
    Deploying contracts only needs to happen once per chain. If you want to use Vector on a new chain, the easiest thing to do is message the Connext team on Discord & ask us to add support for the new chain. This lets us save the deployment data in a place where everyone can access it & avoids duplicate deployments. If you want to deploy things yourself (or are a member of the Connext team looking for a refresher), read on.

We use [`hardhat-deploy`](https://hardhat.org/plugins/hardhat-deploy.html) which manages all of our contract deployment data in `modules/contracts/deployments/`. You should check inside this folder as well as in `modules/contracts/hardhat.config.ts` to see whether your chain is supported yet.

If not, you'll need to manually edit the hardhat config file to add support. You can mostly copy/paste one of the other network configurations but make sure that you've updated the network name & chain id.

After editing hardhat config, run `make ethprovider` to ensure our hardhat cli script is using the most up-to-date info.

We have a helper script for running hardhat tasks at `ops/hardhat.sh`, use this like you'd use the hardhat cli.

!!! Info
    You can also bypass the fancy dockerized ops by running `cd modules/contracts && npm install && npm run build && hardhat <task_name>`.

To deploy contracts, run something like this:

```bash
 export MNEMONIC="candy maple cake sugar pudding cream honey rich smooth crumble sweet treat"
 export ETH_PROVIDER_URL="https://eth-rinkeby.alchemyapi.io/jsonrpc/123apikey
bash ops/hardhat.sh deploy --network rinkeby
```

!!! Warning
    Make sure the mnemonic cli argument is wrapped in double quotes to ensure it's all interpreted as one argument. Additionally, make sure you put a space in front of any commands that include important secrets to prevent them from being saved to your bash history.

In the above command, `$mnemonic` controls a funded account on whatever chain you plan to deploy to, and `$ethProvider` is a provider URL for the same chain (e.g. an Infura url including an API key). Any newly deployed contracts will have their addresses added to `modules/contracts/deployments/<networkname>/`. Make sure you either commit these changes or submit a PR so that the rest of the world can use these newly deployed contracts too.

!!! Info
    The account that deploys the contracts does not need to be the same one as your vector node's hot wallet.

## Configuring the Router

After setting up dependencies, ssh into the server and enter the Vector repo:

```sh
ssh new-vector
cd vector
```

As we mentioned on the [Router Basics](./basics.md) page, the router sits on top of a `server-node` and consumes its gRPC interface. This means that configuring a router is an extension of configuring a normal `server-node`!

### Router Configuration Keys

Default router configuration can be found in `ops/config/router.default.json`. To setup your custom config, start out by copying this file to `router.config.json`:

```sh
cp ops/config/router.default.json router.config.json
```

(or you can run `make config`, a helper that copies all default config files to the project root)

The router's node can be configured by adding any of the following keys to `router.config.json`:

|         Key         |    Type   |   Description                                                                                                            |
|:-------------------:|:---------:|-------------------------------------------------------------------------------------------------------------------------:|
|   `chainAddresses`  |  `object` |          Specifies the addresses of all relevant contracts, keyed by  `chainId`.                                         |
|   `chainProviders`  |  `object` |     Specifies the URL to use to connect to each chain's provider, keyed by  `chainId`                                    |
|      `logLevel`     |  `string` |     One of `"debug"`, `"info"`, `"warn"`, `"error"` to specify the maximum log level that will be printed.               |
|    `messagingUrl`   |  `string` |   The url used to connect to the messaging service. This will eventually be defaulted in prod-mode to a global service.  |
|        `port`       |  `number` |         The port number on which the stack should be exposed to the outside world.                                       |
|    `allowedSwaps`   |  `object` |             Specifies which swaps are allowed & how swap rates are determined.                                           |
| `rebalanceProfiles` |  `object` | Specifies the thresholds & target while collateralizing some `assetId` on some `chainId` .                               |
|    `awsAccessId`    |  `string` | An API KEY id that specifies credentials for a remote AWS S3 bucket for storing db backups                               |
|    `awsAccessKey`   |  `string` |  An API KEY secret that to authenticate on a remote AWS S3 bucket for storing db backups.                                |
|     `production`    | `boolean` | If `false`, ops will automatically build anything that isn't available locally. If `true, nothing will be built locally. |
|     `logDnaKey`     | `string`  |             An API KEY secret that is used to connect to logdna for parsing and viewing router logs.                     |

### Setting Up Supported Chains

To add support for one or many chains on this router, add a `chainAddresses` and `chainProviders` key to the `router.config.json` file in the root of the vector repo:

```bash
nano router.config.json
```

Recall that you deployed contracts to the chain(s) you want to support [earlier in this guide](#contract-deployment). If you open up your `address-book.json`, you should find deployed addresses for your chain indexed by [chainId](https://chainid.network). Copy them over into the config file like below. Also, plug in a providerURL into your `chainProvider`s object indexed at the same chainId.

```json
// Example Addresses
"chainAddresses": {
    "4": {
      "channelFactoryAddress": "0xF12b5dd4EAD5F743C6BaA640B0216200e89B60Da",
      "channelMastercopyAddress": "0x8CdaF0CD259887258Bc13a92C0a6dA92698644C0",
      "transferRegistryAddress": "0x345cA3e014Aaf5dcA488057592ee47305D9B3e10",
    }
  },
  "chainProviders": {
    "4": "https://rinkeby.infura.io/abc123"
  },
```

!!! Tip
    You can support as many evm-compatible chains as you'd like in the above so long as they have a chainId and you have a provider for that chain!

### Setting Up Supported Assets

Routers need to explicitly configure their supported assets. We do this by setting up a `rebalanceProfile` for each asset we want to support.

In order to forward transfers, routers first need to have liquidity (i.e. collateral) in the recipient-side channel to route a transfer over. A `rebalanceProfile` defines parameters around minimum, maximum, and targete liquidity amounts for a given asset. We cover this in more depth in our [Managing Collateral](./managingCollateral.md) section.

An example profile just for Eth looks like the following. Note that we use a combination of `chainId` and `assetId` to represent a given asset (where `0x0` is the "base" asset of the chain):

```json
// E.g. Eth
{
    "chainId": 1,
    "assetId": "0x0000000000000000000000000000000000000000", 
    "reclaimThreshold": "200000000000000000",
    "target": "100000000000000000",
    "collateralizeThreshold": "50000000000000000"
},
```

You can add profiles by setting them under the `rebalanceProfile` key in your `router.config.json`:

```json
"rebalanceProfiles": [
    {
      "chainId": 1,
      "assetId": "0x0000000000000000000000000000000000000000",
      "reclaimThreshold": "200000000000000000",
      "target": "100000000000000000",
      "collateralizeThreshold": "50000000000000000"
    },
    {
      "chainId": 1,
      "assetId": "0x8f0483125FCb9aaAEFA9209D8E9d7b9C8B9Fb90F",
      "reclaimThreshold": "2000000000000000000",
      "target": "1000000000000000000",
      "collateralizeThreshold": "500000000000000000"
    },
]
```

Connext routers also support in-flight swaps when forwarding transfers! In other words, a router can receive a transfer in $ETH and forward it in $DAI so long as an `allowedSwap` exists for that pair.

To allow swapping between the two assets above, you can set the following up under the `allowedSwaps` key in your `router.config.json`:

```json
  "allowedSwaps": [
    {
      "fromChainId": 1,
      "toChainId": 1,
      "fromAssetId": "0x0000000000000000000000000000000000000000",
      "toAssetId": "0x8f0483125FCb9aaAEFA9209D8E9d7b9C8B9Fb90F",
      "priceType": "hardcoded",
      "hardcodedRate": "1"
    },
    {
      "fromChainId": 1,
      "toChainId": 1,
      "fromAssetId": "0x8f0483125FCb9aaAEFA9209D8E9d7b9C8B9Fb90F",
      "toAssetId": "0x0000000000000000000000000000000000000000",
      "priceType": "hardcoded",
      "hardcodedRate": "1"
    }
  ],
```

!!! Tip
    Above, we're setting default values for rebalance profiles and allowed swaps. In reality, these values (especially swap rates) likely need to be continuously updated at runtime every time period and/or on a per-channel basis. We go over how to plug in data sources for rates and profiles in our [Managing Collateral](./managingCollateral.md) section.

## Spinning Up the Router

Now that we have our configuration complete, we can spin up the router!

This part is pretty easy - in the root of the vector repo, do:

```sh
make restart-router
```

!!! Tip
    `make start-$STACK` is optimized for development & will build everything that's out of date before starting the stack. `make restart-$STACK` on the other hand, won't try to build anything before starting the stack so is better to use in production.
