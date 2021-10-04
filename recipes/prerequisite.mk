
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