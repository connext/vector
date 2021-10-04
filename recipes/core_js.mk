
########################################
# Build Core JS libs
# Keep prerequisites synced w the @connext/* dependencies of each module's package.json

types: node-modules $(shell find modules/types $(find_options))
	$(log_start)
	$(docker_run) "cd modules/types && npm run build"
	$(log_finish) && mv -f $(totalTime) .flags/$@

utils: types $(shell find modules/utils $(find_options))
	$(log_start)
	$(docker_run) "cd modules/utils && npm run build"
	$(log_finish) && mv -f $(totalTime) .flags/$@