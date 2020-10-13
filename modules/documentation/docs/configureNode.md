# Configuration and Deployment

The `node` stack is configurable via the `config-node.json` file. Note that the `duet` and `trio` stacks are designed exclusively for development/testing so these are not configurable.

There is an additional `config-prod.json` file that can apply to either the node or router but not both. The `config-prod.json` file contains your domain name and, because it's _not_ tracked by git, it's a good place to put overrides for secret values like API keys. A prod-mode deployment using a domain name w https must be exposed on port 443, therefore only a single prod-mode stack can run on a given machine at a time.

## Node Configuration API

`config-node.json` contains the default configuration for the `node` stack: `make start-node`.

Any of these values can be overwritten by providing the same key with a new value to `config-prod.json`.

**Node Config Keys:**

- `adminToken` (type: `string`): Currently, this is only used during development to protect a few admin endpoints eg to reset the database between tests. If/when we add admin-only features in prod, they will only be accessible to those who provide the correct adminToken.
- `authUrl` (type: `string`): The url used to authenticate with the messaging service (TODO: merge this with the nats url?)
- `chainAddresses` (type: `object`): Specifies the addresses of all relevant contracts, keyed by `chainId`.
- `chainProviders` (type: `object`): Specifies the URL to use to connect to each chain's provider, keyed by `chainId`
- `logLevel` (type: `string`): one of `"debug"`, `"info"`, `"warn"`, `"error"` to specify the maximum log level that will be printed.
- `mnemonic` (type: `string`): Optional. If provided, the node will use this mnemonic. If not provided, the node will use a hard coded mnemonic with testnet funds in dev-mode (production=false). If not provided in prod, docker secrets will be used to manage the mnemonic; this is a much safer place to store a mnemonic that eg holds mainnet funds.
- `natsUrl` (type: `string`): The URL of the messaging service (TODO: merge with auth url?)
- `port` (type: `number`): The port number on which the stack should be exposed to the outside world.
- `redisUrl` (type: `string`): The URL of the redis instance used to negotiate channel-locks.

### Prod Configuration API

Changes to `config-prod.json` aren't tracked by git so this is a good place to store secret API keys, etc.

Be careful, changes to this file will be applied to both `node` & `router` stacks running on this machine.

**Prod Config Keys:**

- `awsAccessId` (type: `string`): An API KEY id that specifies credentials for a remote AWS S3 bucket for storing db backups
- `awsAccessKey` (type: `string`): An API KEY secret that to authenticate on a remote AWS S3 bucket for storing db backups.
- `domainName` (type: `string`): If provided, https will be auto-configured & the stack will be exposed on port 443.
- `production` (type: `boolean`): Enables prod-mode if true. Implications of this flag:
  - if `false`, ops will automatically build anything that isn't available locally before starting up a given stack. If `true`, nothing will be built locally. Instead, all images will be pulled from docker hub.
  - if `false`, the `global` stack will start up 2 local testnet evm.
  - Mnemonic handling is affected, see docs for the `mnemonic` key in node config.

## Example Configurations

### Basic

### Multiple Chains