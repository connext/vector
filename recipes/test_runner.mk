
test-runner: test-runner-img
test-runner-js: engine $(shell find modules/test-runner/src $(find_options))
	$(log_start)
	$(docker_run) "cd modules/test-runner && npm run build"
	$(log_finish) && mv -f $(totalTime) .flags/$@
test-runner-bundle: test-runner-js $(shell find modules/test-runner/src $(find_options))
	$(log_start)
	$(docker_run) "cd modules/test-runner && npm run build-bundle"
	$(log_finish) && mv -f $(totalTime) .flags/$@
test-runner-img: test-runner-bundle $(shell find modules/test-runner/ops $(find_options))
	$(log_start)
	docker build --file modules/test-runner/ops/Dockerfile $(image_cache) --tag $(project)_test_runner modules/test-runner
	docker tag $(project)_test_runner $(project)_test_runner:$(commit)
	$(log_finish) && mv -f $(totalTime) .flags/$@