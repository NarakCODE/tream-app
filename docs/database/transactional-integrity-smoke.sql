-- Rollback-only tests for a CLEAN disposable target DB with both supplements.
-- Tests constraint behavior in one session, not concurrent interleavings.
BEGIN;
CREATE FUNCTION pg_temp.expect_integrity_state(statement text, wanted text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE observed text;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS observed = RETURNED_SQLSTATE;
  END;
  IF observed IS DISTINCT FROM wanted THEN
    RAISE EXCEPTION 'Expected %, observed % for %', wanted, coalesce(observed, 'success'), statement;
  END IF;
END;
$$;
INSERT INTO public.users(id,email,full_name) VALUES ('usr_integrity','integrity@example.test','Integrity');
INSERT INTO public.workspaces(id,name,slug) VALUES ('wsp_integrity','Integrity','integrity');
INSERT INTO public.memberships(id,workspace_id,user_id,role)
 VALUES ('mem_integrity','wsp_integrity','usr_integrity','OWNER');
INSERT INTO public.teams(id,workspace_id,name,key) VALUES
 ('tea_integrity_a','wsp_integrity','Engineering','ENG'),
 ('tea_integrity_b','wsp_integrity','Design','DES');
INSERT INTO public.issue_statuses(id,workspace_id,team_id,name,category,position,is_default) VALUES
 ('ist_integrity_a','wsp_integrity','tea_integrity_a','Todo','UNSTARTED',0,true),
 ('ist_integrity_b','wsp_integrity','tea_integrity_b','Todo','UNSTARTED',0,true);
INSERT INTO public.issues(id,workspace_id,team_id,number,identifier,title,status_id,created_by_id)
 VALUES ('iss_integrity_a','wsp_integrity','tea_integrity_a',1,'ENG-1','First','ist_integrity_a','mem_integrity');
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.issue_identifiers WHERE workspace_id='wsp_integrity'
    AND issue_id='iss_integrity_a' AND identifier='ENG-1') THEN
    RAISE EXCEPTION 'Create failed to reserve identifier';
  END IF;
  IF (SELECT next_issue_number FROM public.teams WHERE id='tea_integrity_a') <> 2 THEN
    RAISE EXCEPTION 'Create failed to advance allocator';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='issues_current_identifier_owned'
    AND condeferrable AND condeferred) THEN
    RAISE EXCEPTION 'Current alias ownership FK must initially defer';
  END IF;
END $$;
SET CONSTRAINTS issues_current_identifier_owned IMMEDIATE;
SET CONSTRAINTS issues_current_identifier_owned DEFERRED;

-- Atomic team transfer remaps workflow and reserves a target identifier.
UPDATE public.issues SET team_id='tea_integrity_b',number=7,identifier='DES-7',status_id='ist_integrity_b'
 WHERE id='iss_integrity_a';
SET CONSTRAINTS issues_current_identifier_owned IMMEDIATE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.issue_identifiers WHERE issue_id='iss_integrity_a') <> 2 THEN
    RAISE EXCEPTION 'Transfer lost identifier history';
  END IF;
  IF (SELECT next_issue_number FROM public.teams WHERE id='tea_integrity_b') <> 8 THEN
    RAISE EXCEPTION 'Transfer failed to advance target allocator';
  END IF;
END $$;
SET CONSTRAINTS issues_current_identifier_owned DEFERRED;

-- Schema-owner fault injection proves the deferred FK backs up the reservation
-- trigger. The expected-error subtransaction rolls back trigger disabling too.
SELECT pg_temp.expect_integrity_state($test$
 DO $body$ BEGIN
   ALTER TABLE public.issues DISABLE TRIGGER issues_reserve_identifier;
   INSERT INTO public.issues(id,workspace_id,team_id,number,identifier,title,status_id,created_by_id)
     VALUES ('iss_integrity_missing','wsp_integrity','tea_integrity_a',8,'ENG-8','Missing reservation','ist_integrity_a','mem_integrity');
   SET CONSTRAINTS issues_current_identifier_owned IMMEDIATE;
 END $body$;
$test$,'23503');

SELECT pg_temp.expect_integrity_state($test$
 INSERT INTO public.issues(id,workspace_id,team_id,number,identifier,title,status_id,created_by_id)
 VALUES ('iss_integrity_thief','wsp_integrity','tea_integrity_a',1,'ENG-1','Theft','ist_integrity_a','mem_integrity')
$test$,'23505');
SELECT pg_temp.expect_integrity_state($test$
 INSERT INTO public.issues(id,workspace_id,team_id,number,identifier,title,status_id,created_by_id)
 VALUES ('iss_integrity_collision','wsp_integrity','tea_integrity_b',7,'DES-7','Collision','ist_integrity_b','mem_integrity')
$test$,'23505');
SELECT pg_temp.expect_integrity_state($test$
 UPDATE public.issue_identifiers SET issue_id='iss_integrity_fake' WHERE identifier='ENG-1' AND workspace_id='wsp_integrity'
$test$,'23514');
SELECT pg_temp.expect_integrity_state($test$
 INSERT INTO public.issue_identifiers(id,workspace_id,issue_id,identifier)
 VALUES ('iid_integrity_fake','wsp_integrity','iss_integrity_a','ENG-999')
$test$,'23514');
SELECT pg_temp.expect_integrity_state($test$
 DELETE FROM public.issue_identifiers WHERE identifier='ENG-1' AND workspace_id='wsp_integrity'
$test$,'23514');
SELECT pg_temp.expect_integrity_state($test$
 UPDATE public.teams SET key='NEW' WHERE id='tea_integrity_a'
$test$,'23514');
SELECT pg_temp.expect_integrity_state($test$
 UPDATE public.teams SET next_issue_number=1 WHERE id='tea_integrity_b'
$test$,'23514');
SELECT pg_temp.expect_integrity_state($test$
 DELETE FROM public.teams WHERE id='tea_integrity_a'
$test$,'23514');
SELECT pg_temp.expect_integrity_state($test$
 UPDATE public.issues SET identifier='ENG-8' WHERE id='iss_integrity_a'
$test$,'23514');
SELECT pg_temp.expect_integrity_state($test$
 UPDATE public.issues SET workspace_id='wsp_other' WHERE id='iss_integrity_a'
$test$,'23514');
SELECT pg_temp.expect_integrity_state($test$
 UPDATE public.issues SET number=8 WHERE id='iss_integrity_a'
$test$,'23514');
-- Going back to an alias owned by the same issue is safe; other issues cannot steal it.
UPDATE public.issues SET team_id='tea_integrity_a',number=1,identifier='ENG-1',status_id='ist_integrity_a'
 WHERE id='iss_integrity_a';
SET CONSTRAINTS issues_current_identifier_owned IMMEDIATE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.issue_identifiers WHERE issue_id='iss_integrity_a') <> 2 THEN
    RAISE EXCEPTION 'Restoring owned alias should preserve both reservations';
  END IF;
END $$;
ROLLBACK;
