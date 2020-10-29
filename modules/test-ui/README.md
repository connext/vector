# Browser Node Test UI

Basic UI to test that `browser-node` comes up properly.

## Running

- Verify the `vector/node.config.json` (if provided) has the correct params, change the mnemonic if needed. By default it's configured to connect to a local global stack (see `vector/ops/config/*.default.json` for default config values)
- Run `make start-global` from repo root.
- Run `make start-test-ui` from repo root to start the UI.
