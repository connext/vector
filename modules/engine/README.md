# Vector Engine

The engine wraps the core Vector protocol. It implements business logic for some default types of conditional transfers, converts user-facing parameters/events to protocol parameters/events, and exposes a JSON RPC interface that is consumed by the `server-node`, `browser-node` or any other node implementation.

Note: because the engine runs behind a JSON RPC interface, it is entirely possible to run the core protocol (incl keys, access to services, etc.) in an isolated environment such as a browser iframe, and then only expose limited functionality for interacting with a user's channel to the outside world. We believe this is the safest way to enable state channel applications that run in the browser.

Contents:

- [Developing and Running Tests](#developing-and-running-tests)
- JSON RPC interface // TODO
- Events // TODO

## Developing and Running Tests

In `~/vector` (root), run:

- `make engine` to build the protocol
- `make test-engine` to run the unit tests
