engine: utils protocol $(shell find modules/engine $(find_options))
	$(log_start)
	$(docker_run) "cd modules/engine && npm run build"
	$(log_finish) && mv -f $(totalTime) .flags/$@