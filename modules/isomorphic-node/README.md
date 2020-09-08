# Connext Isomorphic Node

Implementation of a Connext node. This package contains a node implementation that is isomorphic, so it can be used in either a browser context or a Node.js process.

## Architecture

The architecture of the node is based on the [clean architecture pattern](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html). It draws inspiration from the following sources:

- https://github.com/alireza-bonab/clean-todo/tree/39794697ee301639f4ff4b837a674535050fd1ac
- https://github.com/dannielhugo/typescript-clean-architecture

### File Structure

#### `core`

The `core` directory contains all definitions and interfaces related to business logic. An important consideration is it should not contain any implementation details. Everything should be based on interfaces and dependencies should be injected into the class constructors.

`usecases` are the business logic which drives each of the app's external methods. Everything related to a `usecase` is within the folder, including input/output definitions, error definitions, and test cases.

#### `data`

The `data` directory is where the actual implementations of the interfaces in `core` are.

#### `frameworks`

The `frameworks` directory contains the specific dependency injection pattern which registers the dependencies and resolves the main `app`.

### Error Handling
