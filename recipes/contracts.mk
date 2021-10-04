contracts: contracts-js
ethprovider: contracts-img
contracts-js: utils modules/contracts/hardhat.config.ts $(shell find modules/contracts/src.sol modules/contracts/src.ts modules/contracts/deploy $(find_options))
	$(log_start)
	$(docker_run) "cd modules/contracts && npm run build"
	$(log_finish) && mv -f $(totalTime) .flags/$@
contracts-img: contracts-js $(shell find modules/contracts/ops $(find_options))
	$(log_start)
	docker build --file modules/contracts/ops/Dockerfile $(image_cache) --tag $(project)_ethprovider modules/contracts
	docker tag $(project)_ethprovider $(project)_ethprovider:$(commit)
	$(log_finish) && mv -f $(totalTime) .flags/$@