# Welfare Platform

Multi-tenant welfare/association management platform. Full product and financial requirements: [docs/requirements](docs/requirements/welfare-platform-requirements.html).

## Structure

```
apps/
  api/      NestJS backend — tenancy, rule engine, ledger, claims, RBAC (Section 20)
  admin/    Next.js admin console — committee/treasurer-facing screens (Section 20)
  mobile/   Flutter mobile app — member-facing app (Section 20)
packages/
  shared-types/  TypeScript types/DTOs shared between api and admin (rule engine shapes, entities)
docs/
  requirements/  Final spec (WELF-PRD-001) and plain-English companion guide
infra/
  docker/   Local Postgres/Redis compose setup
.github/workflows/   CI pipelines
```

`apps/mobile` is a separate Dart/Flutter project and does not participate in the npm workspace below — it lives here so the whole product ships from one repo.

## Workspace

This repo uses native npm workspaces (`apps/*`, `packages/*`) — no extra tooling required beyond Node ≥20 and npm ≥10.

```
npm install     # installs and links all workspace packages
```

## Status

Phase 0 (technical foundation) not yet started. See `docs/requirements/welfare-platform-requirements.html` Section 24 for the full roadmap and MVP scope.
