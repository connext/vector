########################################
# Test Commands

test-units: test-utils test-contracts test-protocol test-engine test-router
test-integrations: test-messaging test-duet test-trio test-node
test-all: test-units test-integrations

# Unit Tests

test-utils: utils
	bash ops/test-unit.sh utils test
watch-utils: types
	bash ops/test-unit.sh utils watch

test-contracts: contracts-js
	bash ops/test-unit.sh contracts test
gas-test-contracts: contracts-js
	bash ops/test-unit.sh contracts test-gas
watch-contracts: utils
	bash ops/test-unit.sh contracts watch

test-protocol: contracts-js protocol
	bash ops/test-unit.sh protocol test 1340
watch-protocol: contracts-js
	bash ops/test-unit.sh protocol watch 1340

test-engine: contracts-js engine
	bash ops/test-unit.sh engine test 1341
watch-engine: contracts-js protocol
	bash ops/test-unit.sh engine watch 1341

test-server-node: server-node-js
	bash ops/start-messaging.sh
	bash ops/test-unit.sh server-node test 1342
watch-server-node: engine
	bash ops/start-messaging.sh
	bash ops/test-unit.sh server-node watch 1342

test-browser-node: browser-node
	bash ops/test-unit.sh browser-node test
watch-browser-node: browser-node
	bash ops/test-unit.sh browser-node watch

test-router: router-js
	bash ops/start-messaging.sh
	bash ops/test-unit.sh router test
watch-router: engine
	bash ops/test-unit.sh router watch

# Integration Tests

test-messaging: messaging test-runner
	bash ops/test-integration.sh messaging test
watch-messaging: messaging test-runner
	bash ops/test-integration.sh messaging watch

test-duet: test-runner duet
	bash ops/test-integration.sh duet test
watch-duet: test-runner duet
	bash ops/test-integration.sh duet watch

test-trio: test-runner trio
	bash ops/test-integration.sh trio test
watch-trio: test-runner trio
	bash ops/test-integration.sh trio watch

test-load: test-runner trio
	bash ops/test-load.sh cyclical

test-concurrency: test-runner trio
	bash ops/test-load.sh concurrency 3

test-channel-bandwidth: test-runner trio
	bash ops/test-load.sh channel-bandwidth

test-node: node test-runner
	bash ops/test-integration.sh node test
watch-node: node test-runner
	bash ops/test-integration.sh node watch

test-routing-node: router test-runner
	bash ops/test-integration.sh router test
watch-routing-node: router test-runner
	bash ops/test-integration.sh router watch