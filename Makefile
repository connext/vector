
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
image_cache=$(shell if [[ -n "${GITHUB_WORKFLOW}" ]]; then echo "--cache-from=$(project)_builder:latest,$(project)_database:latest,$(project)_ethprovider:latest,$(project)_server-node:latest,$(project)_router:latest,$(project)_messaging_proxy:latest,$(project)_iframe_app"; else echo ""; fi)

interactive=$(shell if [[ -t 0 && -t 2 ]]; then echo "--interactive"; else echo ""; fi)

########################################
# Setup more vars

find_options=-type f -not -path "*/node_modules/*" -not -name "address-book.json" -not -name "*.swp" -not -path "*/.*" -not -path "*/cache/*" -not -path "*/build/*" -not -path "*/dist/*" -not -name "*.log" -not -path "*/artifacts/*"

docker_run=docker run --name=$(project)_builder $(interactive) --tty --rm --volume=$(root):/app $(project)_builder $(id)

startTime=.flags/.startTime
totalTime=.flags/.totalTime
log_start=@echo "=============";echo "[Makefile] => Start building $@"; date "+%s" > $(startTime)
log_finish=@echo $$((`date "+%s"` - `cat $(startTime)`)) > $(totalTime); rm $(startTime); echo "[Makefile] => Finished building $@ in `cat $(totalTime)` seconds";echo "=============";echo

########################################
# Build Shortcuts

default: dev
dev: messaging node router duet trio test-runner-js
prod: messaging-prod node-prod router-prod test-runner
all: dev prod iframe-app

messaging: auth-bundle ethprovider messaging-proxy nats
messaging-prod: auth-img messaging-proxy nats

node: messaging server-node-img
node-prod: messaging-prod database server-node-img

router: node router-img
router-prod: node-prod router-img

duet: messaging server-node-js
trio: messaging server-node-js router-js

########################################
# Command & Control Shortcuts

start: start-router
restart: restart-router
stop: stop-router

start-node: node
	@bash ops/start-node.sh
restart-node: stop-node
	@bash ops/start-node.sh
stop-node:
	@bash ops/stop.sh node

start-router: router
	@bash ops/start-router.sh
restart-router: stop-router
	@bash ops/start-router.sh
stop-router:
	@bash ops/stop.sh router

start-duet: duet
	@bash ops/start-duet.sh
restart-duet: stop-duet
	@bash ops/start-duet.sh
stop-duet:
	@bash ops/stop.sh duet

start-trio: trio
	@bash ops/start-trio.sh
restart-trio: stop-trio
	@bash ops/start-trio.sh
stop-trio:
	@bash ops/stop.sh trio

start-chains: ethprovider
	@bash ops/start-chains.sh
restart-chains: stop-chains
	@bash ops/start-chains.sh
stop-chains:
	@bash ops/stop.sh chains

start-messaging: messaging
	@bash ops/start-messaging.sh
restart-messaging: stop-messaging
	@bash ops/start-messaging.sh
stop-messaging:
	@bash ops/stop.sh messaging

start-test-ui: browser-node
	@bash ops/start-test-ui.sh

start-iframe-app: browser-node
	@bash ops/start-iframe-app.sh

stop-all:
	@bash ops/stop.sh trio
	@bash ops/stop.sh router
	@bash ops/stop.sh duet
	@bash ops/stop.sh node
	@bash ops/stop.sh global
	@bash ops/stop.sh messaging
	@bash ops/stop.sh chains
	@bash ops/stop.sh evm

clean: stop-all
	rm -rf .flags
	rm -rf modules/*/.*cache* modules/*/node_modules/.cache modules/contracts/cache/*.json
	rm -rf modules/*/artifacts modules/*/build modules/*/dist
	rm -rf modules/*/node_modules/*/.git
	rm -rf modules/*/node_modules/.bin
	rm -rf modules/*/package-lock.json
	rm -rf node_modules/@connext modules/*/node_modules/@connext
	rm -rf node_modules/@walletconnect modules/*/node_modules/@walletconnect
	rm -rf modules/server-node/src/generated

reset: stop-all
	docker container prune -f
	rm -rf *.docker-compose.yml
	rm -rf .chaindata

reset-images:
	rm -f .flags/*-img .flags/database .flags/ethprovider .flags/*proxy .flags/nats

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

config:
	cp -n ops/config/messaging.default.json messaging.config.json
	cp -n ops/config/node.default.json node.config.json
	cp -n ops/config/router.default.json router.config.json
	cp -n ops/config/browser.default.json browser.config.json

reset-config:
	cp -f ops/config/messaging.default.json messaging.config.json
	cp -f ops/config/node.default.json node.config.json
	cp -f ops/config/router.default.json router.config.json
	cp -f ops/config/browser.default.json browser.config.json


########################################
# Test Commands
include recipes/tests.mk


########################################
# Begin Real Build Rules

# All rules from here on should only depend on rules that come before it
# ie first no dependencies, last no dependents


#### Build rules for images and npm builds ############

include recipes/prerequisite.mk

include recipes/core_js.mk

include recipes/contracts.mk

include recipes/protocol.mk

include recipes/engine.mk

include recipes/browser_node.mk

include recipes/auth.mk

include recipes/server_node.mk

include recipes/router.mk

include recipes/iframe_app.mk

include recipes/test_runner.mk

include recipes/other_images.mk


