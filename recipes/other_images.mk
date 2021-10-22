
########################################
# Build More Docker Images

database: $(shell find ops/database $(find_options))
	$(log_start)
	docker build --file ops/database/Dockerfile $(image_cache) --tag $(project)_database ops/database
	docker tag $(project)_database $(project)_database:$(commit)
	$(log_finish) && mv -f $(totalTime) .flags/$@

nats: $(shell find ops/nats $(find_options))
	$(log_start)
	docker build --file ops/nats/Dockerfile $(image_cache) --tag $(project)_nats ops/nats
	docker tag $(project)_nats $(project)_nats:$(commit)
	$(log_finish) && mv -f $(totalTime) .flags/$@

messaging-proxy: $(shell find ops/proxy $(find_options))
	$(log_start)
	docker build $(image_cache) --tag $(project)_messaging_proxy ops/proxy
	docker tag $(project)_messaging_proxy $(project)_messaging_proxy:$(commit)
	$(log_finish) && mv -f $(totalTime) .flags/$@

ssh-action: $(shell find ops/ssh-action $(find_options))
	$(log_start)
	docker build --file ops/ssh-action/Dockerfile --tag $(project)_ssh_action ops/ssh-action
	docker tag $(project)_ssh_action $(project)_ssh_action:$(commit)
	$(log_finish) && mv -f $(totalTime) .flags/$@