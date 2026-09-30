-- Rollback-only tests after all target SQL supplements, in a disposable database.
BEGIN;
CREATE FUNCTION pg_temp.hardening_expect(statement text, wanted text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE observed text;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS observed = RETURNED_SQLSTATE;
  END;
  IF observed IS DISTINCT FROM wanted THEN
    RAISE EXCEPTION 'Expected %, got %: %', wanted, coalesce(observed, 'success'), statement;
  END IF;
END;
$$;
INSERT INTO public.users (id,email,full_name) VALUES ('hard_usr','hard@example.test','Hardening');
INSERT INTO public.workspaces (id,name,slug) VALUES ('hard_ws','Hardening','hardening');
SELECT pg_temp.hardening_expect($q$INSERT INTO public.users(id,email,full_name) VALUES ('hard_usr2',' HARD@example.test ','Duplicate')$q$,'23505');
SELECT pg_temp.hardening_expect($q$INSERT INTO public.workspaces(id,name,slug) VALUES ('hard_ws2','Duplicate',' HARDENING ')$q$,'23514');
SELECT pg_temp.hardening_expect($q$INSERT INTO public.workspaces(id,name,slug) VALUES ('hard_ws2','Duplicate','hardening')$q$,'23505');
INSERT INTO public.memberships (id,workspace_id,user_id,role) VALUES ('hard_mem','hard_ws','hard_usr','OWNER');
INSERT INTO public.teams (id,workspace_id,name,key) VALUES ('hard_t1','hard_ws','One','ONE'),('hard_t2','hard_ws','Two','TWO');
INSERT INTO public.issue_statuses(id,workspace_id,team_id,name,category,position,is_default)
 VALUES ('hard_s1','hard_ws','hard_t1','Todo','UNSTARTED',0,true),('hard_s2','hard_ws','hard_t2','Todo','UNSTARTED',0,true);
INSERT INTO public.project_statuses(id,workspace_id,name,category,position,is_default)
 VALUES ('hard_ps','hard_ws','Planned','PLANNED',0,true);
INSERT INTO public.projects(id,workspace_id,name,status_id,created_by_id)
 VALUES ('hard_proj','hard_ws','Project','hard_ps','hard_mem');
INSERT INTO public.project_teams(id,workspace_id,project_id,team_id)
 VALUES ('hard_pt','hard_ws','hard_proj','hard_t1');
INSERT INTO public.issues(id,workspace_id,team_id,number,identifier,title,status_id,created_by_id)
 VALUES ('hard_iss','hard_ws','hard_t1',1,'ONE-1','Issue','hard_s1','hard_mem');
INSERT INTO public.labels(id,workspace_id,name,color,team_id) VALUES
 ('hard_l1','hard_ws','One label','#f00','hard_t1'),('hard_l2','hard_ws','Two label','#0f0','hard_t2'),
 ('hard_lg','hard_ws','Global label','#00f',NULL);
INSERT INTO public.issue_labels(id,workspace_id,issue_id,label_id) VALUES
 ('hard_il','hard_ws','hard_iss','hard_l1'),('hard_ilg','hard_ws','hard_iss','hard_lg');
SELECT pg_temp.hardening_expect($q$INSERT INTO public.issue_labels(id,workspace_id,issue_id,label_id) VALUES ('hard_badil','hard_ws','hard_iss','hard_l2')$q$,'23514');
SELECT pg_temp.hardening_expect($q$UPDATE public.issues SET team_id='hard_t2',status_id='hard_s2',number=1,identifier='TWO-1' WHERE id='hard_iss'$q$,'23514');
SELECT pg_temp.hardening_expect($q$UPDATE public.labels SET team_id='hard_t2' WHERE id='hard_l1'$q$,'23514');
INSERT INTO public.project_labels(id,workspace_id,project_id,label_id) VALUES ('hard_pl','hard_ws','hard_proj','hard_lg');
SELECT pg_temp.hardening_expect($q$UPDATE public.issue_labels SET label_id='hard_l2' WHERE id='hard_il'$q$,'23514');
SELECT pg_temp.hardening_expect($q$UPDATE public.project_labels SET label_id='hard_l1' WHERE id='hard_pl'$q$,'23514');
SELECT pg_temp.hardening_expect($q$INSERT INTO public.project_labels(id,workspace_id,project_id,label_id) VALUES ('hard_badpl','hard_ws','hard_proj','hard_l1')$q$,'23514');
SELECT pg_temp.hardening_expect($q$UPDATE public.labels SET team_id='hard_t1' WHERE id='hard_lg'$q$,'23514');
DELETE FROM public.issue_labels WHERE id='hard_il';
UPDATE public.issues SET team_id='hard_t2',status_id='hard_s2',number=1,identifier='TWO-1' WHERE id='hard_iss';
INSERT INTO public.issue_labels(id,workspace_id,issue_id,label_id) VALUES ('hard_il2','hard_ws','hard_iss','hard_l2');

INSERT INTO public.dynamic_databases(id,workspace_id,name) VALUES
 ('hard_db1','hard_ws','Source'),('hard_db2','hard_ws','Target'),('hard_db3','hard_ws','Other');
INSERT INTO public.dynamic_fields(id,workspace_id,database_id,name,key,type,relation_database_id) VALUES
 ('hard_rel','hard_ws','hard_db1','Relation','relation','RELATION','hard_db2'),
 ('hard_user','hard_ws','hard_db1','Owner','owner','USER',NULL),
 ('hard_text','hard_ws','hard_db1','Text','text','TEXT',NULL);
INSERT INTO public.dynamic_records(id,workspace_id,database_id,created_by_id) VALUES
 ('hard_rec1','hard_ws','hard_db1','hard_mem'),('hard_rec2','hard_ws','hard_db2','hard_mem'),('hard_rec3','hard_ws','hard_db3','hard_mem');
INSERT INTO public.dynamic_record_relations(id,workspace_id,database_id,record_id,field_id,target_database_id,target_record_id)
 VALUES ('hard_r','hard_ws','hard_db1','hard_rec1','hard_rel','hard_db2','hard_rec2');
SELECT pg_temp.hardening_expect($q$INSERT INTO public.dynamic_record_relations(id,workspace_id,database_id,record_id,field_id,target_database_id,target_record_id) VALUES ('hard_badtarget','hard_ws','hard_db1','hard_rec1','hard_rel','hard_db3','hard_rec3')$q$,'23514');
SELECT pg_temp.hardening_expect($q$INSERT INTO public.dynamic_record_relations(id,workspace_id,database_id,record_id,field_id,target_database_id,target_record_id) VALUES ('hard_badtype','hard_ws','hard_db1','hard_rec1','hard_text','hard_db2','hard_rec2')$q$,'23514');
SELECT pg_temp.hardening_expect($q$UPDATE public.dynamic_fields SET relation_database_id='hard_db3' WHERE id='hard_rel'$q$,'23514');
SELECT pg_temp.hardening_expect($q$UPDATE public.dynamic_record_relations SET target_database_id='hard_db3',target_record_id='hard_rec3' WHERE id='hard_r'$q$,'23514');
SELECT pg_temp.hardening_expect($q$UPDATE public.dynamic_fields SET type='TEXT',relation_database_id=NULL WHERE id='hard_rel'$q$,'23514');
INSERT INTO public.dynamic_record_users(id,workspace_id,database_id,record_id,field_id,membership_id)
 VALUES ('hard_u','hard_ws','hard_db1','hard_rec1','hard_user','hard_mem');
SELECT pg_temp.hardening_expect($q$INSERT INTO public.dynamic_record_users(id,workspace_id,database_id,record_id,field_id,membership_id) VALUES ('hard_badu','hard_ws','hard_db1','hard_rec1','hard_text','hard_mem')$q$,'23514');
SELECT pg_temp.hardening_expect($q$UPDATE public.dynamic_fields SET type='TEXT' WHERE id='hard_user'$q$,'23514');
SELECT pg_temp.hardening_expect($q$UPDATE public.dynamic_record_users SET field_id='hard_text' WHERE id='hard_u'$q$,'23514');
DELETE FROM public.dynamic_record_relations WHERE id='hard_r';
UPDATE public.dynamic_fields SET relation_database_id='hard_db3' WHERE id='hard_rel';
INSERT INTO public.dynamic_record_relations(id,workspace_id,database_id,record_id,field_id,target_database_id,target_record_id)
 VALUES ('hard_r3','hard_ws','hard_db1','hard_rec1','hard_rel','hard_db3','hard_rec3');
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
