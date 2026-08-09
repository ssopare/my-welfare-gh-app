#!/bin/sh
# Runs once, only against a freshly-initialized data directory (Postgres's
# own docker-entrypoint-initdb.d convention). Creates the restricted,
# non-superuser role the NestJS app connects as at runtime. This role must
# NOT have BYPASSRLS/SUPERUSER, or the tenant-isolation RLS policies (added
# later by a Prisma migration, once the tables exist) are meaningless.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	DO \$\$
	BEGIN
		IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
			CREATE ROLE app_runtime LOGIN PASSWORD '${APP_DB_PASSWORD}';
		END IF;
	END
	\$\$;
EOSQL
