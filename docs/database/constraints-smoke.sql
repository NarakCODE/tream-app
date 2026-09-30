-- Rollback-only smoke tests for the PROPOSED target schema and SQL supplements.
-- Prerequisite: clean disposable DB loaded from DBML, then postgresql-constraints.sql.
-- Run as schema owner: psql -v ON_ERROR_STOP=1 -f docs/database/constraints-smoke.sql
-- Readable fixture IDs are deliberately not production ULIDs. Never run on real data.
-- This verifies single-session invariants; it is NOT a concurrency/locking test.
BEGIN;

CREATE FUNCTION pg_temp.expect_sqlstate(statement text, wanted text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE observed text;
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS observed = RETURNED_SQLSTATE;
  END;
  IF observed IS DISTINCT FROM wanted THEN
    RAISE EXCEPTION 'Expected SQLSTATE %, got % for %', wanted, coalesce(observed, 'success'), statement;
  END IF;
END;
$$;

INSERT INTO public.users (id, email, full_name) VALUES
 ('usr_constraints_a', 'constraints-a@example.test', 'Fixture A'),
 ('usr_constraints_b', 'constraints-b@example.test', 'Fixture B');
INSERT INTO public.workspaces (id, name, slug) VALUES
 ('wsp_constraints_a', 'Constraints A', 'constraints-a'),
 ('wsp_constraints_b', 'Constraints B', 'constraints-b');
INSERT INTO public.memberships (id, workspace_id, user_id, role) VALUES
 ('mem_constraints_a', 'wsp_constraints_a', 'usr_constraints_a', 'OWNER'),
 ('mem_constraints_a2', 'wsp_constraints_a', 'usr_constraints_b', 'MEMBER'),
 ('mem_constraints_b', 'wsp_constraints_b', 'usr_constraints_b', 'OWNER');
INSERT INTO public.teams (id, workspace_id, name, key) VALUES
 ('tea_constraints_a', 'wsp_constraints_a', 'Engineering', 'ENG'),
 ('tea_constraints_a2', 'wsp_constraints_a', 'Design', 'DES'),
 ('tea_constraints_b', 'wsp_constraints_b', 'Engineering', 'ENG');
INSERT INTO public.issue_statuses (id, workspace_id, team_id, name, category, position, is_default) VALUES
 ('ist_constraints_a', 'wsp_constraints_a', 'tea_constraints_a', 'Todo', 'UNSTARTED', 0, true),
 ('ist_constraints_a2', 'wsp_constraints_a', 'tea_constraints_a2', 'Todo', 'UNSTARTED', 0, true),
 ('ist_constraints_b', 'wsp_constraints_b', 'tea_constraints_b', 'Todo', 'UNSTARTED', 0, true);
INSERT INTO public.project_statuses (id, workspace_id, name, category, position, is_default) VALUES
 ('pst_constraints_a', 'wsp_constraints_a', 'Planned', 'PLANNED', 0, true),
 ('pst_constraints_b', 'wsp_constraints_b', 'Planned', 'PLANNED', 0, true);
INSERT INTO public.projects (id, workspace_id, name, status_id, created_by_id) VALUES
 ('prj_constraints_a', 'wsp_constraints_a', 'Project A', 'pst_constraints_a', 'mem_constraints_a');
INSERT INTO public.project_teams (id, workspace_id, project_id, team_id) VALUES
 ('ptm_constraints_a', 'wsp_constraints_a', 'prj_constraints_a', 'tea_constraints_a');
INSERT INTO public.issues (id, workspace_id, team_id, number, identifier, title, status_id, created_by_id) VALUES
 ('iss_constraints_a', 'wsp_constraints_a', 'tea_constraints_a', 1, 'ENG-1', 'Issue A', 'ist_constraints_a', 'mem_constraints_a'),
 ('iss_constraints_a2', 'wsp_constraints_a', 'tea_constraints_a', 2, 'ENG-2', 'Issue B', 'ist_constraints_a', 'mem_constraints_a'),
 ('iss_constraints_b', 'wsp_constraints_b', 'tea_constraints_b', 1, 'ENG-1', 'Issue C', 'ist_constraints_b', 'mem_constraints_b');
INSERT INTO public.initiatives (id, workspace_id, name, created_by_id) VALUES
 ('ini_constraints_a', 'wsp_constraints_a', 'Initiative', 'mem_constraints_a');
INSERT INTO public.saved_views (id, workspace_id, name, owner_id, resource) VALUES
 ('vie_constraints_a', 'wsp_constraints_a', 'My view', 'mem_constraints_a', 'ISSUES');
INSERT INTO public.documents (id, workspace_id, title, body, author_id, project_id) VALUES
 ('doc_constraints_a', 'wsp_constraints_a', 'Document', 'Body', 'mem_constraints_a', 'prj_constraints_a');
INSERT INTO public.files (id, workspace_id, uploaded_by_id, storage_key, filename, mime_type, size_bytes) VALUES
 ('fil_constraints_a', 'wsp_constraints_a', 'mem_constraints_a', 'constraints/file-a', 'a.txt', 'text/plain', 1);
INSERT INTO public.issue_comments (id, workspace_id, issue_id, author_id, body) VALUES
 ('com_constraints_a', 'wsp_constraints_a', 'iss_constraints_a', 'mem_constraints_a', 'Comment');
INSERT INTO public.contacts (id, workspace_id, email) VALUES
 ('con_constraints_a', 'wsp_constraints_a', 'Customer@Example.test'),
 ('con_constraints_b', 'wsp_constraints_b', 'Customer@Example.test');
INSERT INTO public.customer_requests (id, workspace_id, contact_id, submitted_by_id, title) VALUES
 ('crq_constraints_a', 'wsp_constraints_a', 'con_constraints_a', 'mem_constraints_a', 'Customer feedback');


SELECT pg_temp.expect_sqlstate($test$INSERT INTO public.issue_statuses (id, workspace_id, team_id, name, category, position, is_default) VALUES ('ist_constraints_duplicate', 'wsp_constraints_a', 'tea_constraints_a', 'Ready', 'UNSTARTED', 1, true)$test$, '23505');

INSERT INTO public.issue_statuses (id, workspace_id, team_id, name, category, position, is_default, archived_at) VALUES ('ist_constraints_archived', 'wsp_constraints_a', 'tea_constraints_a', 'Old default', 'UNSTARTED', 2, true, now());

SELECT pg_temp.expect_sqlstate($test$INSERT INTO public.issue_statuses (id, workspace_id, team_id, name, category, position) VALUES ('ist_constraints_case', 'wsp_constraints_a', 'tea_constraints_a', ' TODO ', 'UNSTARTED', 3)$test$, '23505');

SELECT pg_temp.expect_sqlstate($test$INSERT INTO public.project_statuses (id, workspace_id, name, category, position, is_default) VALUES ('pst_constraints_duplicate', 'wsp_constraints_a', 'Started', 'STARTED', 1, true)$test$, '23505');

SELECT pg_temp.expect_sqlstate($test$INSERT INTO public.project_statuses (id, workspace_id, name, category, position) VALUES ('pst_constraints_case', 'wsp_constraints_a', ' PLANNED ', 'PLANNED', 2)$test$, '23505');

INSERT INTO public.workspace_invitations (id, workspace_id, email, role, invited_by_id, token_hash, expires_at) VALUES ('inv_constraints_a', 'wsp_constraints_a', 'Invitee@Example.test', 'MEMBER', 'mem_constraints_a', 'hash_constraints_a', now() + interval '1 day');

SELECT pg_temp.expect_sqlstate($test$INSERT INTO public.workspace_invitations (id, workspace_id, email, role, invited_by_id, token_hash, expires_at) VALUES ('inv_constraints_duplicate', 'wsp_constraints_a', ' invitee@example.test ', 'MEMBER', 'mem_constraints_a', 'hash_constraints_duplicate', now() + interval '1 day')$test$, '23505');

INSERT INTO public.workspace_invitations (id, workspace_id, email, role, invited_by_id, token_hash, expires_at) VALUES ('inv_constraints_b', 'wsp_constraints_b', 'invitee@example.test', 'MEMBER', 'mem_constraints_b', 'hash_constraints_b', now() + interval '1 day');

UPDATE public.workspace_invitations SET revoked_at = now() WHERE id = 'inv_constraints_a';

INSERT INTO public.workspace_invitations (id, workspace_id, email, role, invited_by_id, token_hash, expires_at) VALUES ('inv_constraints_replacement', 'wsp_constraints_a', 'invitee@example.test', 'MEMBER', 'mem_constraints_a', 'hash_constraints_replacement', now() + interval '1 day');

SELECT pg_temp.expect_sqlstate($test$INSERT INTO public.contacts (id, workspace_id, email) VALUES ('con_constraints_duplicate', 'wsp_constraints_a', ' customer@example.test ')$test$, '23505');

UPDATE public.contacts SET deleted_at = now() WHERE id = 'con_constraints_a'; INSERT INTO public.contacts (id, workspace_id, email) VALUES ('con_constraints_replacement', 'wsp_constraints_a', 'customer@example.test');

INSERT INTO public.labels (id, workspace_id, name, color, team_id) VALUES ('lbl_constraints_w', 'wsp_constraints_a', 'Bug', '#ff0000', NULL), ('lbl_constraints_t', 'wsp_constraints_a', 'Bug', '#ff0000', 'tea_constraints_a'), ('lbl_constraints_t2', 'wsp_constraints_a', 'Bug', '#ff0000', 'tea_constraints_a2'), ('lbl_constraints_b', 'wsp_constraints_b', 'Bug', '#ff0000', NULL);

SELECT pg_temp.expect_sqlstate($test$INSERT INTO public.labels (id, workspace_id, name, color) VALUES ('lbl_constraints_dupw', 'wsp_constraints_a', ' BUG ', '#ff0000')$test$, '23505');

SELECT pg_temp.expect_sqlstate($test$INSERT INTO public.labels (id, workspace_id, name, color, team_id) VALUES ('lbl_constraints_dupt', 'wsp_constraints_a', ' bug ', '#ff0000', 'tea_constraints_a')$test$, '23505');

UPDATE public.labels SET archived_at = now() WHERE id = 'lbl_constraints_w'; INSERT INTO public.labels (id, workspace_id, name, color) VALUES ('lbl_constraints_replacement', 'wsp_constraints_a', 'Bug', '#ff0000');

INSERT INTO public.favorites (id, workspace_id, membership_id, issue_id) VALUES ('fav_constraints_0', 'wsp_constraints_a', 'mem_constraints_a', 'iss_constraints_a');

SELECT pg_temp.expect_sqlstate($test$INSERT INTO public.favorites (id, workspace_id, membership_id, issue_id) VALUES ('fav_constraints_dup0', 'wsp_constraints_a', 'mem_constraints_a', 'iss_constraints_a')$test$, '23505');

INSERT INTO public.favorites (id, workspace_id, membership_id, issue_id) VALUES ('fav_constraints_other0', 'wsp_constraints_a', 'mem_constraints_a2', 'iss_constraints_a');

INSERT INTO public.favorites (id, workspace_id, membership_id, project_id) VALUES ('fav_constraints_1', 'wsp_constraints_a', 'mem_constraints_a', 'prj_constraints_a');

SELECT pg_temp.expect_sqlstate($test$INSERT INTO public.favorites (id, workspace_id, membership_id, project_id) VALUES ('fav_constraints_dup1', 'wsp_constraints_a', 'mem_constraints_a', 'prj_constraints_a')$test$, '23505');

INSERT INTO public.favorites (id, workspace_id, membership_id, project_id) VALUES ('fav_constraints_other1', 'wsp_constraints_a', 'mem_constraints_a2', 'prj_constraints_a');

INSERT INTO public.favorites (id, workspace_id, membership_id, team_id) VALUES ('fav_constraints_2', 'wsp_constraints_a', 'mem_constraints_a', 'tea_constraints_a');

SELECT pg_temp.expect_sqlstate($test$INSERT INTO public.favorites (id, workspace_id, membership_id, team_id) VALUES ('fav_constraints_dup2', 'wsp_constraints_a', 'mem_constraints_a', 'tea_constraints_a')$test$, '23505');

INSERT INTO public.favorites (id, workspace_id, membership_id, team_id) VALUES ('fav_constraints_other2', 'wsp_constraints_a', 'mem_constraints_a2', 'tea_constraints_a');

INSERT INTO public.favorites (id, workspace_id, membership_id, initiative_id) VALUES ('fav_constraints_3', 'wsp_constraints_a', 'mem_constraints_a', 'ini_constraints_a');

SELECT pg_temp.expect_sqlstate($test$INSERT INTO public.favorites (id, workspace_id, membership_id, initiative_id) VALUES ('fav_constraints_dup3', 'wsp_constraints_a', 'mem_constraints_a', 'ini_constraints_a')$test$, '23505');

INSERT INTO public.favorites (id, workspace_id, membership_id, initiative_id) VALUES ('fav_constraints_other3', 'wsp_constraints_a', 'mem_constraints_a2', 'ini_constraints_a');

INSERT INTO public.favorites (id, workspace_id, membership_id, view_id) VALUES ('fav_constraints_4', 'wsp_constraints_a', 'mem_constraints_a', 'vie_constraints_a');

SELECT pg_temp.expect_sqlstate($test$INSERT INTO public.favorites (id, workspace_id, membership_id, view_id) VALUES ('fav_constraints_dup4', 'wsp_constraints_a', 'mem_constraints_a', 'vie_constraints_a')$test$, '23505');

INSERT INTO public.favorites (id, workspace_id, membership_id, view_id) VALUES ('fav_constraints_other4', 'wsp_constraints_a', 'mem_constraints_a2', 'vie_constraints_a');

INSERT INTO public.attachments (id, workspace_id, file_id, issue_id) VALUES ('att_constraints_0', 'wsp_constraints_a', 'fil_constraints_a', 'iss_constraints_a');

SELECT pg_temp.expect_sqlstate($test$INSERT INTO public.attachments (id, workspace_id, file_id, issue_id) VALUES ('att_constraints_dup0', 'wsp_constraints_a', 'fil_constraints_a', 'iss_constraints_a')$test$, '23505');

INSERT INTO public.attachments (id, workspace_id, file_id, comment_id) VALUES ('att_constraints_1', 'wsp_constraints_a', 'fil_constraints_a', 'com_constraints_a');

SELECT pg_temp.expect_sqlstate($test$INSERT INTO public.attachments (id, workspace_id, file_id, comment_id) VALUES ('att_constraints_dup1', 'wsp_constraints_a', 'fil_constraints_a', 'com_constraints_a')$test$, '23505');

INSERT INTO public.attachments (id, workspace_id, file_id, project_id) VALUES ('att_constraints_2', 'wsp_constraints_a', 'fil_constraints_a', 'prj_constraints_a');

SELECT pg_temp.expect_sqlstate($test$INSERT INTO public.attachments (id, workspace_id, file_id, project_id) VALUES ('att_constraints_dup2', 'wsp_constraints_a', 'fil_constraints_a', 'prj_constraints_a')$test$, '23505');

INSERT INTO public.attachments (id, workspace_id, file_id, document_id) VALUES ('att_constraints_3', 'wsp_constraints_a', 'fil_constraints_a', 'doc_constraints_a');

SELECT pg_temp.expect_sqlstate($test$INSERT INTO public.attachments (id, workspace_id, file_id, document_id) VALUES ('att_constraints_dup3', 'wsp_constraints_a', 'fil_constraints_a', 'doc_constraints_a')$test$, '23505');

INSERT INTO public.customer_request_links (id, workspace_id, request_id, issue_id) VALUES ('crl_constraints_0', 'wsp_constraints_a', 'crq_constraints_a', 'iss_constraints_a');

SELECT pg_temp.expect_sqlstate($test$INSERT INTO public.customer_request_links (id, workspace_id, request_id, issue_id) VALUES ('crl_constraints_dup0', 'wsp_constraints_a', 'crq_constraints_a', 'iss_constraints_a')$test$, '23505');

INSERT INTO public.customer_request_links (id, workspace_id, request_id, project_id) VALUES ('crl_constraints_1', 'wsp_constraints_a', 'crq_constraints_a', 'prj_constraints_a');

SELECT pg_temp.expect_sqlstate($test$INSERT INTO public.customer_request_links (id, workspace_id, request_id, project_id) VALUES ('crl_constraints_dup1', 'wsp_constraints_a', 'crq_constraints_a', 'prj_constraints_a')$test$, '23505');

SELECT pg_temp.expect_sqlstate($test$INSERT INTO public.favorites (id, workspace_id, membership_id) VALUES ('fav_constraints_no_owner', 'wsp_constraints_a', 'mem_constraints_a')$test$, '23514');

SELECT pg_temp.expect_sqlstate($test$INSERT INTO public.attachments (id, workspace_id, file_id, issue_id, project_id) VALUES ('att_constraints_two_owners', 'wsp_constraints_a', 'fil_constraints_a', 'iss_constraints_a', 'prj_constraints_a')$test$, '23514');

SELECT pg_temp.expect_sqlstate($test$INSERT INTO public.customer_request_links (id, workspace_id, request_id) VALUES ('crl_constraints_no_owner', 'wsp_constraints_a', 'crq_constraints_a')$test$, '23514');

INSERT INTO public.issue_relations (id, workspace_id, source_issue_id, target_issue_id, type, created_by_id) VALUES ('rel_constraints_related', 'wsp_constraints_a', 'iss_constraints_a', 'iss_constraints_a2', 'RELATED', 'mem_constraints_a');

SELECT pg_temp.expect_sqlstate($test$INSERT INTO public.issue_relations (id, workspace_id, source_issue_id, target_issue_id, type, created_by_id) VALUES ('rel_constraints_reverse', 'wsp_constraints_a', 'iss_constraints_a2', 'iss_constraints_a', 'RELATED', 'mem_constraints_a')$test$, '23505');

INSERT INTO public.issue_relations (id, workspace_id, source_issue_id, target_issue_id, type, created_by_id) VALUES ('rel_constraints_blocks', 'wsp_constraints_a', 'iss_constraints_a', 'iss_constraints_a2', 'BLOCKS', 'mem_constraints_a'), ('rel_constraints_block_reverse', 'wsp_constraints_a', 'iss_constraints_a2', 'iss_constraints_a', 'BLOCKS', 'mem_constraints_a');

INSERT INTO public.cycles (id, workspace_id, team_id, number, name, starts_at, ends_at) VALUES ('cyc_constraints_1', 'wsp_constraints_a', 'tea_constraints_a', 1, 'First', '2030-01-01T00:00:00Z', '2030-01-15T00:00:00Z'), ('cyc_constraints_2', 'wsp_constraints_a', 'tea_constraints_a', 2, 'Touching', '2030-01-15T00:00:00Z', '2030-02-01T00:00:00Z'), ('cyc_constraints_other_team', 'wsp_constraints_a', 'tea_constraints_a2', 1, 'Other team', '2030-01-01T00:00:00Z', '2030-02-01T00:00:00Z'), ('cyc_constraints_other_workspace', 'wsp_constraints_b', 'tea_constraints_b', 1, 'Other workspace', '2030-01-01T00:00:00Z', '2030-02-01T00:00:00Z');

SELECT pg_temp.expect_sqlstate($test$INSERT INTO public.cycles (id, workspace_id, team_id, number, name, starts_at, ends_at) VALUES ('cyc_constraints_overlap', 'wsp_constraints_a', 'tea_constraints_a', 3, 'Overlap', '2030-01-14T00:00:00Z', '2030-01-16T00:00:00Z')$test$, '23P01');

SELECT pg_temp.expect_sqlstate($test$UPDATE public.cycles SET starts_at = '2030-01-14T00:00:00Z' WHERE id = 'cyc_constraints_2'$test$, '23P01');

SELECT pg_temp.expect_sqlstate($test$INSERT INTO public.cycles (id, workspace_id, team_id, number, name, starts_at, ends_at) VALUES ('cyc_constraints_empty', 'wsp_constraints_a', 'tea_constraints_a', 3, 'Empty', '2030-03-01T00:00:00Z', '2030-03-01T00:00:00Z')$test$, '23514');


-- Project catalog archival releases the default slot, but preserves name reservation.
UPDATE public.project_statuses SET archived_at = now() WHERE id = 'pst_constraints_a';
INSERT INTO public.project_statuses (id, workspace_id, name, category, position, is_default)
VALUES ('pst_constraints_replacement', 'wsp_constraints_a', 'New default', 'PLANNED', 4, true);

-- Expiration is not index state: expired outstanding invitations must be revoked.
INSERT INTO public.workspace_invitations
 (id, workspace_id, email, role, invited_by_id, token_hash, created_at, expires_at)
VALUES ('inv_constraints_expired', 'wsp_constraints_a', 'expired@example.test', 'MEMBER', 'mem_constraints_a', 'hash_constraints_expired', now() - interval '2 days', now() - interval '1 day');
SELECT pg_temp.expect_sqlstate($test$
 INSERT INTO public.workspace_invitations (id, workspace_id, email, role, invited_by_id, token_hash, expires_at)
 VALUES ('inv_constraints_expired_dup', 'wsp_constraints_a', 'EXPIRED@example.test', 'MEMBER', 'mem_constraints_a', 'hash_constraints_expired_dup', now() + interval '1 day')
$test$, '23505');

-- Acceptance also releases the outstanding email slot.
UPDATE public.workspace_invitations SET accepted_at = now(), accepted_by_id = 'mem_constraints_a2'
WHERE id = 'inv_constraints_replacement';
INSERT INTO public.workspace_invitations (id, workspace_id, email, role, invited_by_id, token_hash, expires_at)
VALUES ('inv_constraints_after_accept', 'wsp_constraints_a', 'invitee@example.test', 'MEMBER', 'mem_constraints_a', 'hash_constraints_after_accept', now() + interval '1 day');

-- Transient overlap is allowed only while constraint is explicitly deferred.
SET CONSTRAINTS public.cycles_no_overlapping_team_windows DEFERRED;
UPDATE public.cycles SET starts_at = '2030-01-15T00:00:00Z', ends_at = '2030-02-01T00:00:00Z' WHERE id = 'cyc_constraints_1';
UPDATE public.cycles SET starts_at = '2030-01-01T00:00:00Z', ends_at = '2030-01-15T00:00:00Z' WHERE id = 'cyc_constraints_2';
SET CONSTRAINTS public.cycles_no_overlapping_team_windows IMMEDIATE;
SELECT 'constraints smoke passed: expected failures and allowed cross-scope cases verified' AS result;
ROLLBACK;
