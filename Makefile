
SHELL=/bin/bash # shell make will use to execute commands
VPATH=.flags # prerequisite search path
$(shell mkdir -p $(VPATH))

########################################
# Run shell commands to fetch info from environment

root=$(shell cd "$(shell dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )
project=$(shell cat $(root)/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4)
commit=$(shell git rev-parse HEAD | head -c 8)

# If Linux, give the container our uid & gid so we know what to reset permissions to. If Mac, the docker-VM takes care of this for us so pass root's id (ie noop)
id=$(shell if [[ "`uname`" == "Darwin" ]]; then echo 0:0; else echo "`id -u`:`id -g`"; fi)

# Pool of images to pull cached layers from during docker build steps
image_cache=$(shell if [[ -n "${GITHUB_WORKFLOW}" ]]; then echo "--cache-from=$(project)_builder:latest,$(project)_database:latest,$(project)_ethprovider:latest,$(project)_server-node:latest,$(project)_router:latest,$(project)_global_proxy:latest,$(project)_node_proxy:latest,$(project)_router_proxy:latest"; else echo ""; fi)

interactive=$(shell if [[ -t 0 && -t 2 ]]; then echo "--interactive"; else echo ""; fi)

########################################
# Setup more vars

find_options=-type f -not -path "*/node_modules/*" -not -name "address-book.json" -not -name "*.swp" -not -path "*/.*" -not -path "*/cache/*" -not -path "*/build/*" -not -path "*/dist/*" -not -name "*.log"

docker_run=docker run --name=$(project)_builder $(interactive) --tty --rm --volume=$(root):/root $(project)_builder $(id)

startTime=.flags/.startTime
totalTime=.flags/.totalTime
log_start=@echo "=============";echo "[Makefile] => Start building $@"; date "+%s" > $(startTime)
log_finish=@echo $$((`date "+%s"` - `cat $(startTime)`)) > $(totalTime); rm $(startTime); echo "[Makefile] => Finished building $@ in `cat $(totalTime)` seconds";echo "=============";echo

########################################
# Build Shortcuts

default: router

global: auth ethprovider global-proxy nats
node: global database node-proxy server-node
router: node router-img router-proxy
duet: global node
trio: global node router
extras: test-runner

all: global node browser-node router duet trio extras

########################################
# Command & Control Shortcuts

start: start-node
restart: restart-node
stop: stop-node

start-node: node
	@bash ops/start-node.sh
restart-node:
	@bash ops/stop.sh node
	@bash ops/start-node.sh
stop-node:
	@bash ops/stop.sh node

start-router: router
	@bash ops/start-router.sh
restart-router:
	@bash ops/stop.sh router
	@bash ops/start-router.sh
stop-router:
	@bash ops/stop.sh router

start-duet: duet
	@bash ops/start-duet.sh
restart-duet:
	@bash ops/stop.sh duet
	@bash ops/start-duet.sh
stop-duet:
	@bash ops/stop.sh duet

start-trio: trio
	@bash ops/start-trio.sh
restart-trio:
	@bash ops/stop.sh trio
	@bash ops/start-trio.sh
stop-trio:
	@bash ops/stop.sh trio

start-global: global
	@bash ops/start-global.sh
restart-global:
	@bash ops/stop.sh global
	@bash ops/start-global.sh
stop-global:
	@bash ops/stop.sh global

start-browser-node-test-ui: browser-node
	@bash ops/start-browser-node-test-ui.sh

stop-all:
	@bash ops/stop.sh trio
	@bash ops/stop.sh router
	@bash ops/stop.sh duet
	@bash ops/stop.sh node
	@bash ops/stop.sh global
	@bash ops/stop.sh evm

clean: stop-all
	docker container prune -f
	rm -rf .flags/*
	rm -rf node_modules/@connext modules/*/node_modules/@connext
	rm -rf node_modules/@walletconnect modules/*/node_modules/@walletconnect
	rm -rf modules/*/node_modules/*/.git
	rm -rf modules/*/node_modules/.bin
	rm -rf modules/*/artifacts modules/*/build modules/*/dist
	rm -rf modules/*/.*cache* modules/*/node_modules/.cache modules/contracts/cache/*.json
	rm -rf modules/*/package-lock.json

reset: stop-all
	docker container prune -f
	docker network rm $(project) 2> /dev/null || true
	docker secret rm $(project)_database_dev 2> /dev/null || true
	docker volume rm $(project)_database_dev  2> /dev/null || true
	docker volume rm `docker volume ls -q -f name=$(project)_database_test_*` 2> /dev/null || true
	rm -rf .chaindata/*
	rm -rf *.docker-compose.yml

reset-images:
	rm -f .flags/auth .flags/database .flags/ethprovider .flags/*proxy .flags/server-node .flags/nats

purge: clean reset

########################################
# Misc Shortcuts

push:
	bash ops/push-images.sh

pull:
	bash ops/pull-images.sh

pull-latest:
	bash ops/pull-images.sh latest

dls:
	@docker service ls
	@echo "====="
	@docker container ls -a

lint:
	bash ops/lint.sh

########################################
# Test Commands

test-units: test-utils test-contracts test-protocol test-engine test-router
test-integrations: test-global test-duet test-trio test-node
test-all: test-units test-integrations

# Unit Tests

test-utils: utils
	bash ops/test-unit.sh utils test
watch-utils: types
	bash ops/test-unit.sh utils watch

test-contracts: contracts
	bash ops/test-unit.sh contracts test
watch-contracts: utils
	bash ops/test-unit.sh contracts watch

test-protocol: protocol
	bash ops/test-unit.sh protocol test 1340
watch-protocol: contracts
	bash ops/test-unit.sh protocol watch 1340

test-engine: engine
	bash ops/test-unit.sh engine test 1341
watch-engine: protocol
	bash ops/test-unit.sh engine watch 1341

test-server-node: node
	bash ops/test-server-node.sh test
watch-server-node: engine
	bash ops/test-server-node.sh watch

test-browser-node: browser-node-bundle
	bash ops/test-unit.sh browser-node test
watch-browser-node: browser-node-bundle
	bash ops/test-unit.sh browser-node watch

test-router: router
	bash ops/test-unit.sh router test
watch-router: engine
	bash ops/test-unit.sh router watch

# Integration Tests

test-global: test-runner global
	bash ops/test-integration.sh global test
watch-global: test-runner global
	bash ops/test-integration.sh global watch

test-duet: test-runner duet
	bash ops/test-integration.sh duet test
watch-duet: test-runner duet
	bash ops/test-integration.sh duet watch

test-trio: test-runner trio
	bash ops/test-integration.sh trio test
watch-trio: test-runner trio
	bash ops/test-integration.sh trio watch

########################################
# Begin Real Build Rules

# All rules from here on should only depend on rules that come before it
# ie first no dependencies, last no dependents

########################################
# Common Prerequisites

builder: $(shell find ops/builder)
	$(log_start)
	docker build --file ops/builder/Dockerfile $(image_cache) --tag $(project)_builder ops/builder
	docker tag ${project}_builder ${project}_builder:$(commit)
	$(log_finish) && mv -f $(totalTime) .flags/$@

node-modules: builder package.json $(shell ls modules/*/package.json)
	$(log_start)
	$(docker_run) "lerna bootstrap --hoist --no-progress"
	$(log_finish) && mv -f $(totalTime) .flags/$@

########################################
# Build Core JS libs & bundles
# Keep prerequisites synced w the @connext/* dependencies of each module's package.json

types: node-modules $(shell find modules/types $(find_options))
	$(log_start)
	$(docker_run) "cd modules/types && npm run build"
	$(log_finish) && mv -f $(totalTime) .flags/$@

utils: types $(shell find modules/utils $(find_options))
	$(log_start)
	$(docker_run) "cd modules/utils && npm run build"
	$(log_finish) && mv -f $(totalTime) .flags/$@

contracts: utils $(shell find modules/contracts $(find_options))
	$(log_start)
	$(docker_run) "cd modules/contracts && npm run build"
	$(log_finish) && mv -f $(totalTime) .flags/$@

protocol: utils contracts $(shell find modules/protocol $(find_options))
	$(log_start)
	$(docker_run) "cd modules/protocol && npm run build"
	$(log_finish) && mv -f $(totalTime) .flags/$@

engine: utils protocol $(shell find modules/engine $(find_options))
	$(log_start)
	$(docker_run) "cd modules/engine && npm run build"
	$(log_finish) && mv -f $(totalTime) .flags/$@

auth-bundle: utils $(shell find modules/auth $(find_options))
	$(log_start)
	$(docker_run) "cd modules/auth && npm run build"
	$(log_finish) && mv -f $(totalTime) .flags/$@

auth: auth-bundle $(shell find modules/auth/ops $(find_options))
	$(log_start)
	docker build --file modules/auth/ops/Dockerfile $(image_cache) --tag $(project)_auth modules/auth
	docker tag $(project)_auth $(project)_auth:$(commit)
	$(log_finish) && mv -f $(totalTime) .flags/$@

browser-node: engine $(shell find modules/browser-node $(find_options))
	$(log_start)
	$(docker_run) "cd modules/browser-node && npm run build && touch src/index.ts"
	$(log_finish) && mv -f $(totalTime) .flags/$@

server-node-bundle: engine $(shell find modules/server-node $(find_options))
	$(log_start)
	$(docker_run) "cd modules/server-node && npm run build && touch src/index.ts"
	$(log_finish) && mv -f $(totalTime) .flags/$@

server-node: server-node-bundle $(shell find modules/server-node/ops $(find_options))
	$(log_start)
	docker build --file modules/server-node/ops/Dockerfile $(image_cache) --tag $(project)_node modules/server-node
	docker tag $(project)_node $(project)_node:$(commit)
	$(log_finish) && mv -f $(totalTime) .flags/$@

router-bundle: engine $(shell find modules/router $(find_options))
	$(log_start)
	$(docker_run) "cd modules/router && npm run build"
	$(log_finish) && mv -f $(totalTime) .flags/$@

router-img: router-bundle $(shell find modules/router/ops $(find_options))
	$(log_start)
	docker build --file modules/router/ops/Dockerfile $(image_cache) --tag $(project)_router modules/router
	docker tag $(project)_router $(project)_router:$(commit)
	$(log_finish) && mv -f $(totalTime) .flags/$@

test-runner-bundle: engine $(shell find modules/test-runner/src $(find_options))
	$(log_start)
	$(docker_run) "cd modules/test-runner && npm run build"
	$(log_finish) && mv -f $(totalTime) .flags/$@

test-runner: test-runner-bundle $(shell find modules/test-runner/ops $(find_options))
	$(log_start)
	docker build --file modules/test-runner/ops/Dockerfile $(image_cache) --tag $(project)_test_runner modules/test-runner
	docker tag $(project)_test_runner $(project)_test_runner:$(commit)
	$(log_finish) && mv -f $(totalTime) .flags/$@

########################################
# Build More Docker Images

database: $(shell find ops/database $(find_options))
	$(log_start)
	docker build --file ops/database/Dockerfile $(image_cache) --tag $(project)_database ops/database
	docker tag $(project)_database $(project)_database:$(commit)
	$(log_finish) && mv -f $(totalTime) .flags/$@

ethprovider: contracts $(shell find modules/contracts/ops $(find_options))
	$(log_start)
	docker build --file modules/contracts/ops/Dockerfile $(image_cache) --tag $(project)_ethprovider modules/contracts
	docker tag $(project)_ethprovider $(project)_ethprovider:$(commit)
	$(log_finish) && mv -f $(totalTime) .flags/$@

nats: $(shell find ops/nats $(find_options))
	$(log_start)
	docker build --file ops/nats/Dockerfile $(image_cache) --tag $(project)_nats ops/nats
	docker tag $(project)_nats $(project)_nats:$(commit)
	$(log_finish) && mv -f $(totalTime) .flags/$@

global-proxy: $(shell find ops/proxy $(find_options))
	$(log_start)
	docker build $(image_cache) --tag $(project)_global_proxy ops/proxy/global
	docker tag $(project)_global_proxy $(project)_global_proxy:$(commit)
	$(log_finish) && mv -f $(totalTime) .flags/$@

node-proxy: $(shell find ops/proxy $(find_options))
	$(log_start)
	docker build $(image_cache) --tag $(project)_node_proxy ops/proxy/node
	docker tag $(project)_node_proxy $(project)_node_proxy:$(commit)
	$(log_finish) && mv -f $(totalTime) .flags/$@

router-proxy: $(shell find ops/proxy $(find_options))
	$(log_start)
	docker build $(image_cache) --tag $(project)_router_proxy ops/proxy/router
	docker tag $(project)_router_proxy $(project)_router_proxy:$(commit)
	$(log_finish) && mv -f $(totalTime) .flags/$@
