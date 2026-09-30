-- Proposed target supplement, NOT a migration for the current application database.
-- Prerequisite: export linear-workspace.dbml to PostgreSQL and load into a clean
-- disposable database. Apply this file exactly once as schema owner, with permission
-- to install btree_gist. Do not apply to real application data without a reviewed migration.
-- Run psql -v ON_ERROR_STOP=1 -f docs/database/postgresql-constraints.sql.
-- Names are deliberate: no IF NOT EXISTS that could hide an incompatible definition.
BEGIN;
CREATE EXTENSION btree_gist WITH SCHEMA public;

-- At MOST one active default. At-least-one remains a transactional service invariant.
CREATE UNIQUE INDEX issue_statuses_one_active_default
  ON public.issue_statuses (workspace_id, team_id)
  WHERE is_default AND archived_at IS NULL;
CREATE UNIQUE INDEX project_statuses_one_default
  ON public.project_statuses (workspace_id)
  WHERE is_default AND archived_at IS NULL;

-- Normalize email in addition to normalizing application input.
-- Expired invitations remain outstanding until explicitly revoked by cleanup/service.
-- now() is intentionally absent: partial-index predicates must be immutable.
CREATE UNIQUE INDEX invitations_one_outstanding_email
  ON public.workspace_invitations (workspace_id, lower(btrim(email)))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE UNIQUE INDEX contacts_one_active_email
  ON public.contacts (workspace_id, lower(btrim(email)))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX labels_one_active_workspace_name
  ON public.labels (workspace_id, lower(btrim(name)))
  WHERE team_id IS NULL AND archived_at IS NULL;
CREATE UNIQUE INDEX labels_one_active_team_name
  ON public.labels (workspace_id, team_id, lower(btrim(name)))
  WHERE team_id IS NOT NULL AND archived_at IS NULL;

-- Issue status names remain reserved after archive, matching DBML ordinary UNIQUE.
CREATE UNIQUE INDEX issue_statuses_normalized_name
  ON public.issue_statuses (workspace_id, team_id, lower(btrim(name)));
CREATE UNIQUE INDEX project_statuses_normalized_name
  ON public.project_statuses (workspace_id, lower(btrim(name)));


CREATE UNIQUE INDEX favorites_one_issue
  ON public.favorites (workspace_id, membership_id, issue_id)
  WHERE issue_id IS NOT NULL;

CREATE UNIQUE INDEX favorites_one_project
  ON public.favorites (workspace_id, membership_id, project_id)
  WHERE project_id IS NOT NULL;

CREATE UNIQUE INDEX favorites_one_team
  ON public.favorites (workspace_id, membership_id, team_id)
  WHERE team_id IS NOT NULL;

CREATE UNIQUE INDEX favorites_one_initiative
  ON public.favorites (workspace_id, membership_id, initiative_id)
  WHERE initiative_id IS NOT NULL;

CREATE UNIQUE INDEX favorites_one_view
  ON public.favorites (workspace_id, membership_id, view_id)
  WHERE view_id IS NOT NULL;

CREATE UNIQUE INDEX attachments_one_issue
  ON public.attachments (workspace_id, file_id, issue_id)
  WHERE issue_id IS NOT NULL;

CREATE UNIQUE INDEX attachments_one_comment
  ON public.attachments (workspace_id, file_id, comment_id)
  WHERE comment_id IS NOT NULL;

CREATE UNIQUE INDEX attachments_one_project
  ON public.attachments (workspace_id, file_id, project_id)
  WHERE project_id IS NOT NULL;

CREATE UNIQUE INDEX attachments_one_document
  ON public.attachments (workspace_id, file_id, document_id)
  WHERE document_id IS NOT NULL;

CREATE UNIQUE INDEX customer_request_links_one_issue
  ON public.customer_request_links (workspace_id, request_id, issue_id)
  WHERE issue_id IS NOT NULL;

CREATE UNIQUE INDEX customer_request_links_one_project
  ON public.customer_request_links (workspace_id, request_id, project_id)
  WHERE project_id IS NOT NULL;

-- RELATED is undirected; retain one edge regardless of supplied endpoint order.
-- BLOCKS and DUPLICATES remain directional under the ordinary DBML unique key.
CREATE UNIQUE INDEX issue_relations_one_unordered_related
  ON public.issue_relations
    (workspace_id, LEAST(source_issue_id, target_issue_id), GREATEST(source_issue_id, target_issue_id))
  WHERE type = 'RELATED';

-- Half-open windows allow one cycle to end exactly when its successor begins.
-- Includes completed cycles: history cannot silently overlap.
-- Deferral allows an atomic interval swap/reschedule; commit must restore validity.
ALTER TABLE public.cycles
  ADD CONSTRAINT cycles_no_overlapping_team_windows
  EXCLUDE USING gist
    (workspace_id WITH =, team_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
  DEFERRABLE INITIALLY IMMEDIATE;
COMMIT;
