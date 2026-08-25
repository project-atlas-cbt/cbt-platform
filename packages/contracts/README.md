# @atlas/contracts

Generated API types, consumed by `apps/web` (and any future API client).

## Regenerating

```bash
# 1. Emit the OpenAPI document from the running Nest application definition
pnpm --filter @atlas/api run openapi:emit

# 2. Generate types from it
pnpm --filter @atlas/contracts run generate
```

Both are run together by `pnpm run generate` at the repo root (Turborepo
`generate` task). CI runs the same sequence and fails the build if
`git diff --exit-code` finds anything — the generated files are committed so
contract changes are reviewable, never silently drifting from what the API
actually serves.

Never hand-edit `src/generated/openapi-types.ts`.
