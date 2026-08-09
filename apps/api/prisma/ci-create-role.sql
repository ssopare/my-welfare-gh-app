-- CI-only equivalent of infra/docker/initdb/01-create-app-role.sh.
-- GitHub Actions' `services:` containers can't mount custom initdb scripts,
-- so this runs as an explicit step (via `prisma db execute`) instead, before
-- migrations apply. Password is a CI-only throwaway, not a real secret —
-- the database itself is destroyed when the job ends.
DO $$
BEGIN
	IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
		CREATE ROLE app_runtime LOGIN PASSWORD 'app_runtime_ci_password';
	END IF;
END
$$;
