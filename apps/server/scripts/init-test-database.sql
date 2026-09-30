-- Works for fresh volumes and existing development clusters. psql's gexec
-- executes CREATE DATABASE outside a transaction only when it is missing.
SELECT 'CREATE DATABASE tream_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tream_test')
\gexec
