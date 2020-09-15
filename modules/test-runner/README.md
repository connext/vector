
# Test Runner

This code gets packaged into a docker image that be used to run integration tests against vector's various stacks. 

So far, just the `duet` stack:
 - alice: server_node + database
 - bob: server_node + database
 - global: nats + auth + redis

A stack's tests are run from: `src/${stack_name}/index.ts
