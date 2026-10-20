# CPU profile

A full Node CPU profile of the live Medusa process was not taken. Production stays read-only, and a disposable Postgres restore was not started in this pass (the previous `docker run postgres:15-alpine` hung before the container existed).

What was measured on the live payload, outside the request handler:

| Step | time | event-loop max |
|---|---:|---:|
| `JSON.parse` of 559556 bytes | 8.66 ms | |
| `JSON.stringify` of the same object | 4.76 ms | 20.17 ms for the pair |

The 250-415 ms `/health` delay seen while one catalog request runs is therefore not `JSON.stringify`. It sits in `query.graph` materialization and the following synchronous maps. This branch splits the browse product graph and the variant price graph into chunks and yields with `setImmediate` between chunks, then yields again during projection.
