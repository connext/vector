
server-node: server-node-img
server-node-js: engine $(shell find modules/server-node/src $(find_options))
	$(log_start)
	$(docker_run) "cd modules/server-node && npm run build && touch src/index.ts"
	$(log_finish) && mv -f $(totalTime) .flags/$@
server-node-bundle: contracts-js server-node-js $(shell find modules/server-node/src $(find_options))
	$(log_start)
	$(docker_run) "cd modules/server-node && npm run build-bundle"
	$(log_finish) && mv -f $(totalTime) .flags/$@
server-node-img: server-node-bundle $(shell find modules/server-node/ops $(find_options))
	$(log_start)
	docker build --file modules/server-node/ops/Dockerfile $(image_cache) --tag $(project)_node modules/server-node
	docker tag $(project)_node $(project)_node:$(commit)
	$(log_finish) && mv -f $(totalTime) .flags/$@