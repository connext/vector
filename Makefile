
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
image_cache=$(shell if [[ -n "${GITHUB_WORKFLOW}" ]]; then echo "--cache-from=$(project)_builder:latest,$(project)_database:latest,$(project)_ethprovider:latest,$(project)_node:latest,$(project)_proxy:latest"; else echo ""; fi)

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

default: indra
indra: database proxy node
extras: ethprovider
all: indra extras

########################################
# Command & Control Shortcuts

start: indra
	bash ops/start-indra.sh

start-testnet: ethprovider
	INDRA_CHAIN_LOG_LEVEL=1 bash ops/start-testnet.sh

stop:
	bash ops/stop.sh indra

stop-all:
	bash ops/stop.sh indra
	bash ops/stop.sh testnet

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

purge: clean reset

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

utils: node-modules $(shell find modules/utils $(find_options))
	$(log_start)
	$(docker_run) "cd modules/utils && npm run build"
	$(log_finish) && mv -f $(totalTime) .flags/$@

contracts: utils $(shell find modules/contracts $(find_options))
	$(log_start)
	$(docker_run) "cd modules/contracts && npm run build"
	$(log_finish) && mv -f $(totalTime) .flags/$@

engine: utils contracts $(shell find modules/engine $(find_options))
	$(log_start)
	$(docker_run) "cd modules/engine && npm run build"
	$(log_finish) && mv -f $(totalTime) .flags/$@

isomorphic-node-bundle: utils engine $(shell find modules/isomorphic-node $(find_options))
	$(log_start)
	$(docker_run) "cd modules/isomorphic-node && npm run build"
	$(log_finish) && mv -f $(totalTime) .flags/$@

node-bundle: isomorphic-node-bundle $(shell find modules/rest-api-node $(find_options))
	$(log_start)
	$(docker_run) "cd modules/rest-api-node && npm run build"
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

node: node-bundle $(shell find modules/rest-api-node/ops $(find_options))
	$(log_start)
	docker build --file modules/rest-api-node/ops/Dockerfile $(image_cache) --tag $(project)_node modules/rest-api-node
	docker tag $(project)_node $(project)_node:$(commit)
	$(log_finish) && mv -f $(totalTime) .flags/$@

proxy: $(shell find ops/proxy $(find_options))
	$(log_start)
	docker build $(image_cache) --tag $(project)_proxy ops/proxy
	docker tag $(project)_proxy $(project)_proxy:$(commit)
	$(log_finish) && mv -f $(totalTime) .flags/$@
