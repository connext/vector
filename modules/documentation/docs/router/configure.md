# Configuration and Deployment

This guide will take you through the e2e process of configuring and deploying a router.

First get started by cloning the repo if you haven't already
``` bash
git clone git@github.com:connext/vector.git
```

## Contract Deployment

Before anything else, you should first ensure that the required Vector contracts are deployed to your chain.

We have a global [address-book in the root of the Vector repo](https://github.com/connext/vector/blob/master/address-book.json) which contains deployed contract addresses indexed by chainId. If you can't find the specific chain(s) that you want to set up a router at, you likely first need to deploy contracts.

To deploy contracts, you can use our contracts CLI tool! First, build the repo:

```bash
# in vector root
make
```

This should take a few moments. After it's done, cd into the contract repo and call the CLI migrate command:

```bash
cd modules/contracts
dist/cli.js migrate --address-book=/data/address-book.json --mnemonic=$mnemonic --ethProvider=$ethProvider
```

Where `$mnemonic` controls a funded account on whatever chain you plan to deploy to, and `$ethProvider` is a provider URL for the same chain (e.g. Infura).

## Setting Up Required Dependencies

In this section, we assume that you are trying to deploy your router to a remote Ubuntu-based instance. If you're spinning up the router locally, or are using an instance on a different operating system, you'll need to install the following dependencies yourself:

- `make`: Probably already installed, otherwise install w `brew install make` or `apt install make` or similar.
- `jq`: Probably not installed yet, install w `brew install jq` or `apt install jq` or similar.
- `docker`: sadly, Docker is kinda annoying to install. See [website](https://www.docker.com/) for instructions.

To set up dependencies for a remote Ubuntu-based instance, we will use the `server-setup.sh` script located in the `ops/` dir.

First, make sure that you've set up your instance and have the instance's IP/URL on hand + ssh access. Then, clone the repo locally if you haven't already:

```
git clone git@github.com:connext/vector.git
```

!!! Info
    The prod configuration of the router will eventually include a built-in proxy that will automatically set up a DNS and SSL certificates for you. For now, we recommend directly connecting to an exposed instance without setting up a domain name until that's ready.

Next, run `bash ops/server-setup.sh` passing in the instance's IP address or URL. The script will look for your AWS SSH key at `-$HOME/.ssh/id_rsa`. If your ssh key is located elsewhere, be sure to amend the `server-setup.sh` script to direct to your actual keyfile, or else it will fail to log in.

When the script runs, it will prompt you to pass in a mnemonic. Generate a random mnemonic from [here](https://iancoleman.io/bip39/), copy it to your clipboard, and paste it into the prompt. If you choose not to enter a mnemonic, the router will use a default hardcoded mnemonic.

Be sure to back up your mnemonic somewhere safe! Your mnemonic generates the primary key that controls the router.

!!! Warning
    We **strongly** recommend that you do not use the hardcoded mnemonic for any router that is connected to a public chain, including a testnet. The hardcoded mnemonic is publicly viewable in our repo and using it, even just for testing, could result in unpredictable behavior.

The script should automatically do the following tasks to set up the environment:

1. Install all required dependencies.
2. Securely store your mnemonic as a [docker secret](https://docs.docker.com/engine/swarm/secrets/)
3. Clone the Vector repo

Once it's done, you should see a message that says
```
Done configuring server, rebooting now..
```

## Configuring the Router

After setting up dependencies, ssh into the server and cd into the Vector repo:

```
ssh -i ~/.ssh/{path}/{to}/{key} {username}@{server}
cd vector
```

As we mentioned on the [Router Basics](./basics.md) page, the router sits on top of a `server-node` and consumes its gRPC interface. This means that configuring a router is an extension of configuring a normal `server-node`!

### Router Configuration Keys

The router's node can be configured by adding any of the keys in `config-node.json` or `config-router.json` to `config-prod.json` (any values in `config-prod.json` will take precedence).

The most important keys that you'll want to think about are:

|         Key         |    Type   |                                                                                                                           Description                                                                                                                           |
|:-------------------:|:---------:|:---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------:|
|   `chainAddresses`  |  `object` |                                                                                             Specifies the addresses of all relevant contracts, keyed by  `chainId`.                                                                                             |
|   `chainProviders`  |  `object` |                                                                                        Specifies the URL to use to connect to each chain's provider, keyed by  `chainId`                                                                                        |
|      `logLevel`     |  `string` |                                                                              One of `"debug"`, `"info"`, `"warn"`, `"error"` to specify the maximum log level that will be printed.                                                                             |
|    `messagingUrl`   |  `string` |                                                                      The url used to connect to the messaging service. This will eventually be defaulted in prod-mode to a global service.                                                                      |
|        `port`       |  `number` |                                                                                            The port number on which the stack should be exposed to the outside world.                                                                                           |
|    `allowedSwaps`   |  `object` |                                                                                                Specifies which swaps are allowed & how swap rates are determined.                                                                                               |
| `rebalanceProfiles` |  `object` |                                                                                    Specifies the thresholds & target while collateralizing some `assetId` on some `chainId` .                                                                                   |
|    `awsAccessId`    |  `string` |                                                                                    An API KEY id that specifies credentials for a remote AWS S3 bucket for storing db backups                                                                                   |
|    `awsAccessKey`   |  `string` |                                                                                     An API KEY secret that to authenticate on a remote AWS S3 bucket for storing db backups.                                                                                    |
|     `domainName`    |  `string` |                                                                                       If provided, https will be auto-configured & the stack will be exposed on port 443.                                                                                       |
|     `production`    | `boolean` | Enables prod-mode if true. Implications: If `false`, ops will automatically build anything that isn't available locally before starting up a given stack. If `false`, the `global` stack will set up two testnet evms. If `true, nothing will be built locally. |

!!! Info
    `production=true` and `domainName` are not yet fully supported.

### Setting Up Supported Chains

To add support for one or many chains on this router, add a `chainAddresses` and `chainProviders` key to the `config-prod.json` file in the root of the vector repo:

``` bash
nano config-prod.json
```

Recall that you deployed contracts to the chain(s) you want to support [earlier in this guide](#contract-deployment). If you open up your `address-book.json`, you should find deployed addresses for your chain indexed by [chainId](https://chainid.network). Copy them over into the config file like below. Also, plug in a providerURL into your `chainProvider`s object indexed at the same chainId.

``` json
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

``` json
// E.g. Eth
{
    "chainId": 1,
    "assetId": "0x0000000000000000000000000000000000000000", 
    "reclaimThreshold": "200000000000000000",
    "target": "100000000000000000",
    "collateralizeThreshold": "50000000000000000"
},
```

You can add profiles by setting them under the `rebalanceProfile` key in your `config-prod.json`:

``` json
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

To allow swapping between the two assets above, you can set the following up under the `allowedSwaps` key in your `config-prod.json`:

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

```
make start-router
```

The build process should take some time, but once it's done you should be able to `GET` the `/config/` endpoint.

!!! Bug
    The above config endpoint doesn't yet work. We believe this is an issue with the `proxy` and are working to get it fixed ASAP.


