

iframe-app: iframe-app-img
iframe-app-js: browser-node $(shell find modules/iframe-app $(find_options))
	$(log_start)
	$(docker_run) "cd modules/iframe-app && npm run build"
	$(log_finish) && mv -f $(totalTime) .flags/$@
iframe-app-img: iframe-app-js $(shell find modules/iframe-app/ops $(find_options))
	$(log_start)
	docker build --file modules/iframe-app/ops/Dockerfile $(image_cache) --tag $(project)_iframe_app modules/iframe-app
	docker tag $(project)_iframe_app $(project)_iframe_app:$(commit)
	$(log_finish) && mv -f $(totalTime) .flags/$@