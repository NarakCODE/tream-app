-- Rollback-only target schema tests, after all supplements. Single-session evidence.
BEGIN;
CREATE FUNCTION pg_temp.expect_state(statement text, wanted text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE observed text;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS observed = RETURNED_SQLSTATE;
  END;
  IF observed IS DISTINCT FROM wanted THEN
    RAISE EXCEPTION 'Expected %, got % for %', wanted, coalesce(observed, 'success'), statement;
  END IF;
END;
$$;
INSERT INTO public.users(id,email,full_name) VALUES ('usr_evt','evt@example.test','Event fixture');
INSERT INTO public.workspaces(id,name,slug) VALUES ('wsp_evt','Events','events-fixture');
INSERT INTO public.event_aggregate_heads(id,workspace_id,aggregate_type,aggregate_id)
  VALUES ('head_evt','wsp_evt','workspace','wsp_evt');
UPDATE public.event_aggregate_heads SET current_version=1 WHERE id='head_evt';
INSERT INTO public.events(id,workspace_id,event_type,schema_version,aggregate_type,aggregate_id,aggregate_version,payload,idempotency_key)
 VALUES ('evt_a','wsp_evt','workspace.created',1,'workspace','wsp_evt',1,'{}','command-a'),
        ('evt_b','wsp_evt','workspace.updated',1,'workspace','wsp_evt',1,'{}','command-a');
-- Database checks envelope storage/revision only; JSON Schema validation is the producer boundary.
SELECT pg_temp.expect_state($q$UPDATE public.event_aggregate_heads SET current_version=0 WHERE id='head_evt'$q$, '23514');
SELECT pg_temp.expect_state($q$UPDATE public.event_aggregate_heads SET current_version=3 WHERE id='head_evt'$q$, '23514');
SELECT pg_temp.expect_state($q$UPDATE public.events SET payload='{}' WHERE id='evt_a'$q$, '23514');
SELECT pg_temp.expect_state($q$DELETE FROM public.events WHERE id='evt_a'$q$, '23514');
SELECT pg_temp.expect_state($q$INSERT INTO public.events(id,workspace_id,event_type,schema_version,aggregate_type,aggregate_id,aggregate_version,payload) VALUES ('evt_bad','wsp_evt','workspace.created',1,'workspace','wsp_evt',2,'{}')$q$, '23514');
INSERT INTO public.event_consumer_receipts(id,workspace_id,event_id,consumer_key) VALUES ('rcpt_evt','wsp_evt','evt_a','notification');
SELECT pg_temp.expect_state($q$INSERT INTO public.event_consumer_receipts(id,workspace_id,event_id,consumer_key) VALUES ('rcpt_dup','wsp_evt','evt_a','notification')$q$, '23505');
SELECT pg_temp.expect_state($q$DELETE FROM public.event_consumer_receipts WHERE id='rcpt_evt'$q$, '23514');
SELECT pg_temp.expect_state($q$INSERT INTO public.memberships(id,workspace_id,user_id,role,state) VALUES ('mem_bad','wsp_evt','usr_evt','MEMBER','LEFT')$q$, '23514');
SELECT pg_temp.expect_state($q$INSERT INTO public.idempotency_keys(id,user_id,method,route,key,request_hash,status,expires_at) VALUES ('idem_bad','usr_evt','POST','/fixture','00000000-0000-4000-8000-000000000001','hash','COMPLETED',now()+interval '1 day')$q$, '23514');
SELECT pg_temp.expect_state($q$INSERT INTO public.event_dispatch_attempts(id,workspace_id,event_id,consumer_key,status) VALUES ('job_bad','wsp_evt','evt_a','fixture','PROCESSING')$q$, '23514');
SELECT pg_temp.expect_state($q$INSERT INTO public.event_dispatch_attempts(id,workspace_id,event_id,consumer_key,status) VALUES ('job_bad','wsp_evt','evt_a','fixture','SUCCEEDED')$q$, '23514');
INSERT INTO public.event_dispatch_attempts(id,workspace_id,event_id,consumer_key,status,locked_at,locked_by) VALUES ('job_evt','wsp_evt','evt_a','fixture','PROCESSING',now(),'worker-1');
UPDATE public.event_dispatch_attempts SET status='SUCCEEDED',completed_at=now(),locked_at=NULL,locked_by=NULL WHERE id='job_evt';
ROLLBACK;
