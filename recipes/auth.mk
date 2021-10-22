
auth: auth-img
auth-js: utils $(shell find modules/auth $(find_options))
	$(log_start)
	$(docker_run) "cd modules/auth && npm run build"
	$(log_finish) && mv -f $(totalTime) .flags/$@
auth-bundle: auth-js utils $(shell find modules/auth $(find_options))
	$(log_start)
	$(docker_run) "cd modules/auth && npm run build-bundle"
	$(log_finish) && mv -f $(totalTime) .flags/$@
auth-img: auth-bundle $(shell find modules/auth/ops $(find_options))
	$(log_start)
	docker build --file modules/auth/ops/Dockerfile $(image_cache) --tag $(project)_auth modules/auth
	docker tag $(project)_auth $(project)_auth:$(commit)
	$(log_finish) && mv -f $(totalTime) .flags/$@