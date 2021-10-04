
protocol: utils contracts-js $(shell find modules/protocol $(find_options))
	$(log_start)
	$(docker_run) "cd modules/protocol && npm run build"
	$(log_finish) && mv -f $(totalTime) .flags/$@