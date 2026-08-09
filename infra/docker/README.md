# infra/docker — local Postgres + Redis

Local dev services only (Postgres 16, Redis 7). Not used in production deploys.

```bash
cd infra/docker
cp .env.example .env
docker compose up -d
```

Postgres: `postgresql://welfare:welfare@localhost:5432/welfare_platform` (default — **if 5432 is already taken**, e.g. by a native Postgres install on the host, set `POSTGRES_PORT` in `.env` to a free port, e.g. `5433`; a native install can silently grab just the IPv4 slice of 5432 while Docker still binds the IPv6 slice, so `docker compose ps` showing the port as published is not proof it's actually your container — verify with `docker exec <container> psql ...`, not a host-side `localhost` connection, if a query behaves unexpectedly).
Redis: `redis://localhost:6379` (default — **if 6379 is already taken by another local project**, set `REDIS_PORT` in `.env` to a free port, e.g. `6381`).

Besides the `welfare` superuser (used only for migrations), the postgres container also provisions a restricted `app_runtime` role on first init (via `initdb/01-create-app-role.sh`, password from `APP_DB_PASSWORD` in `.env`) — this is the role the NestJS app actually connects as, and it deliberately has no `BYPASSRLS`/`SUPERUSER`, which is what makes the tenant-isolation RLS policies in `apps/api/prisma/migrations` mean anything. That init script only runs against a **fresh** data directory — if you change it, `docker compose down` and delete `./volumes/postgres` to pick it up.

Data persists to `./volumes/` (bind-mounted, gitignored). To reset state: `docker compose down` then delete `./volumes/`.
