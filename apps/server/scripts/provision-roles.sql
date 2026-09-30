-- Run as the database administrator against the intended application database.
-- These are NOLOGIN permission groups. Grant one to a separately provisioned
-- login/service identity; credentials belong in the infrastructure secret store.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tream_runtime') THEN
    CREATE ROLE tream_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tream_migrator') THEN
    CREATE ROLE tream_migrator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO tream_runtime;
GRANT USAGE, CREATE ON SCHEMA public TO tream_migrator;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tream_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tream_runtime;
REVOKE UPDATE, DELETE ON events, audit_logs, event_consumer_receipts FROM tream_runtime;
-- No TRUNCATE, schema creation, migration schema access, ownership or DDL is
-- granted to the runtime group. Immutable fact triggers provide another guard.
ALTER DEFAULT PRIVILEGES FOR ROLE tream_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tream_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE tream_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO tream_runtime;
-- For a new database, run migrations SET ROLE tream_migrator so it owns new
-- objects. For an existing database, an administrator must explicitly transfer
-- application-object ownership before using that migration role. Do not grant
-- the runtime login membership in tream_migrator or the database-owner role.
