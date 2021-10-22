
router-js: engine $(shell find modules/router $(find_options))
	$(log_start)
	$(docker_run) "cd modules/router && npm run build"
	$(log_finish) && mv -f $(totalTime) .flags/$@
router-bundle: contracts-js router-js $(shell find modules/router $(find_options))
	$(log_start)
	$(docker_run) "cd modules/router && npm run build-bundle"
	$(log_finish) && mv -f $(totalTime) .flags/$@
router-img: router-bundle $(shell find modules/router/ops $(find_options))
	$(log_start)
	docker build --file modules/router/ops/Dockerfile $(image_cache) --tag $(project)_router modules/router
	docker tag $(project)_router $(project)_router:$(commit)
	$(log_finish) && mv -f $(totalTime) .flags/$@