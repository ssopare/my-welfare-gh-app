# infra/docker — local Postgres + Redis

Local dev services only (Postgres 16, Redis 7). Not used in production deploys.

```bash
cd infra/docker
cp .env.example .env
docker compose up -d
```

Postgres: `postgresql://welfare:welfare@localhost:5432/welfare_platform` (defaults, override via `.env`).
Redis: `redis://localhost:6379` (default — **if 6379 is already taken by another local project**, set `REDIS_PORT` in `.env` to a free port, e.g. `6381`).

Data persists to `./volumes/` (bind-mounted, gitignored). To reset state: `docker compose down` then delete `./volumes/`.
