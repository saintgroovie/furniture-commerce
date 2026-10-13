# Payload

One live `GET /store/catalog-products` from the storefront container to the backend, 2026-10-12.

- HTTP 200
- bytes: 559556
- products: 248
- `Cache-Control`: empty
- images JSON: 69260 bytes
- metadata JSON: 353695 bytes
- variants JSON: 55227 bytes
- titles JSON: 11704 bytes

Metadata is most of the body. It is on the allowlist the cards and PDP sibling chips read (`finish_*`, `bed_execution_matrix`, dimensions, prices). This branch does not drop those fields.

`JSON.stringify` of that object: 4.76 ms. Event-loop delay during parse plus stringify: max 20.17 ms.
