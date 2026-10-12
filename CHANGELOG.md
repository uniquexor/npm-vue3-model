# Changelog

## 2.0.0

- Upgrade `pinia-orm` and `@pinia-orm/axios` to `^2.0.0`.
- Require Node >=22.12.0; declare Pinia 3/4 and Axios >=1.13.2 <2 peers.
- Preserve the existing `Model`, `Response` and source subpath APIs.
- Declare the existing ESM format and fix the relative QueryExpander import for Node.
- Add integration tests covering models, transformers, dirty tracking, lifecycle
  hooks, requests, validation, pagination, sorting and relation expansion.
- Refresh the dependency lockfile, restrict published files to runtime sources
  and documentation, and run tests before publishing.
- Document application migration, v1 retention and npm publication.

Upstream requirements and behavior changes make this a major release even though
the wrapper's public method signatures remain unchanged. See README.md for migration.
