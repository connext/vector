
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
image_cache=$(shell if [[ -n "${GITHUB_WORKFLOW}" ]]; then echo "--cache-from=$(project)_builder:latest,$(project)_database:latest,$(project)_ethprovider:latest,$(project)_server-node:latest,$(project)_proxy:latest"; else echo ""; fi)

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

default: vector
vector: database proxy server-node
extras: auth ethprovider global-proxy
all: vector extras

########################################
# Command & Control Shortcuts

start: vector
	bash ops/start-global-services.sh
	bash ops/start-node.sh

start-testnet: ethprovider
	VECTOR_CHAIN_LOG_LEVEL=1 bash ops/start-testnet.sh

start-global: auth global-proxy
	bash ops/start-global-services.sh

restart-global: auth global-proxy
	bash ops/stop.sh connext
	bash ops/start-global-services.sh

stop:
	bash ops/stop.sh vector

stop-all:
	bash ops/stop.sh vector
	bash ops/stop.sh testnet
	bash ops/stop.sh connext

restart: vector stop
	bash ops/start-global-services.sh
	bash ops/start-node.sh

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

reset-images:
	rm -f .flags/auth .flags/database .flags/ethprovider .flags/node .flags/*proxy

purge: clean reset

push:
	bash ops/push-images.sh

pull:
	bash ops/pull-images.sh

pull-latest:
	bash ops/pull-images.sh latest

build-report:
	bash ops/build-report.sh

dls:
	@docker service ls
	@echo "====="
	@docker container ls -a

lint:
	bash ops/lint.sh

########################################
# Test Commands

test-contracts: contracts
	bash ops/test/unit.sh contracts

watch-contracts: utils
	bash ops/test/unit.sh contracts --watch

test-protocol: protocol
	bash ops/test/protocol.sh test

test-server-node: server-node
	bash ops/test/server-node.sh test

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

auth-bundle: utils $(shell find modules/auth $(find_options))
	$(log_start)
	$(docker_run) "cd modules/auth && npm run build"
	$(log_finish) && mv -f $(totalTime) .flags/$@

engine-bundle: utils protocol $(shell find modules/engine $(find_options))
	$(log_start)
	$(docker_run) "cd modules/engine && npm run build"
	$(log_finish) && mv -f $(totalTime) .flags/$@

server-node-bundle: engine-bundle $(shell find modules/server-node $(find_options))
	$(log_start)
	$(docker_run) "cd modules/server-node && npm run build"
	$(log_finish) && mv -f $(totalTime) .flags/$@

########################################
# Build Docker Images

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

auth: auth-bundle $(shell find modules/auth/ops $(find_options))
	$(log_start)
	docker build --file modules/auth/ops/Dockerfile $(image_cache) --tag $(project)_auth modules/auth
	docker tag $(project)_auth $(project)_auth:$(commit)
	$(log_finish) && mv -f $(totalTime) .flags/$@

server-node: server-node-bundle $(shell find modules/server-node/ops $(find_options))
	$(log_start)
	docker build --file modules/server-node/ops/Dockerfile $(image_cache) --tag $(project)_server-node modules/server-node
	docker tag $(project)_server-node $(project)_server-node:$(commit)
	$(log_finish) && mv -f $(totalTime) .flags/$@

global-proxy: $(shell find ops/global-proxy $(find_options))
	$(log_start)
	docker build $(image_cache) --tag $(project)_msg_proxy ops/global-proxy
	docker tag $(project)_msg_proxy $(project)_msg_proxy:$(commit)
	$(log_finish) && mv -f $(totalTime) .flags/$@

proxy: $(shell find ops/proxy $(find_options))
	$(log_start)
	docker build $(image_cache) --tag $(project)_proxy ops/proxy
	docker tag $(project)_proxy $(project)_proxy:$(commit)
	$(log_finish) && mv -f $(totalTime) .flags/$@
