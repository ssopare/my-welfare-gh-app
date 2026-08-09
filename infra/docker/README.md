# infra/docker — local Postgres + Redis

Local dev services only (Postgres 16, Redis 7). Not used in production deploys.

```bash
cd infra/docker
cp .env.example .env
docker compose up -d
```

Postgres: `postgresql://welfare:welfare@localhost:5432/welfare_platform` (defaults, override via `.env`).
Redis: `redis://localhost:6379`.

Data persists to `./volumes/` (bind-mounted, gitignored). To reset state: `docker compose down` then delete `./volumes/`.
