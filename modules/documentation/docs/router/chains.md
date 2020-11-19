# Adding a Chain

## Requirements

### Chain Requirements

To integrate with connext your chain must have:

- evm compatability
- `ABIEncoderV2` support
- `EC_RECOVER` support
- `keccak256` support
- same math quirks as solidity (i.e. must underflow and overflow in the same way if your contract is NOT using safe math)
- blocktime/timestamp support
- solidity v7 support

If your chain meets some, but not all, of these requirements, reach out to the Connext team for more detailed integration tests.

### Contract Testing

If there is any concern about whether your chain supports the required behavior, it is possible to run the full contract test suite against your chain:

1. Add the network information to the `hardhat.config.ts`. Specifically, include:

- a funded mnemonic
- a chainId
- a provider url

2. Run the test suite using:

```sh
$ bash ops/test-network.sh <NETWORK_NAME> <CHAIN_PROVIDERS> <FUNDED_MNEMONIC>

# i.e. for running against matic:
# bash ops/test-network.sh "matic" '{ "80001" : "https://rpc-mumbai.matic.today" }' "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat"
```

**NOTE** These tests are _expensive_ to run, and should be done against a testnet.

### Integration Testing

To test a local trio setup against a remote chain:

1. Deploy the contracts to your chain

```sh
bash ops/deploy-contracts.sh -p <PROVIDER_URL> -m <FUNDED_MNEMONIC> -a <ADDRESS_BOOK_PATH>

# the cli inputs are all optional, and if not provided will use the following defaults:
# m: "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat"
# p: "http://localhost:8545"
# a: "./address-book.json"
```

2. Make sure there is a `node.config.json` and a `router.config.json` in the root of your `vector` directory. If one does not exist run:

```sh
make config
```

to create files with the preconfigured defaults for a local setup.

3. Update the `chainProviders` and `chainAddresses` fields in the `node.config.json` to include the providers and deployed contract addresses for your network, respectively. Make sure to keep the formatting consistent. See the node [configuration](../node/configure.md) section for more information.

4. Update the `rebalanceProfiles` field in `router.config.json` to include an entry for the chain with appropriate collateralization values for the native asset. See the router [configuration](./configure.md) section for more information. Once you update the `router.config.json` delete the `trio.docker.compose` (if it exists) to ensure your changes propagate properly.

5. Run the trio happy case tests with:

```sh
make test-trio
```
