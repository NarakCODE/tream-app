-- The workspace row serializes catalog changes and the project row serializes
-- lifecycle and association changes. Application commands acquire them first.
CREATE FUNCTION seed_project_statuses() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO project_statuses(id,workspace_id,name,category,position,is_default)
  SELECT gen_random_uuid()::text,NEW.id,c.name,c.category::project_status,c.position,c.category='PLANNED'
  FROM (VALUES ('Planned','PLANNED',0),('Started','STARTED',1),('Paused','PAUSED',2),('Completed','COMPLETED',3),('Canceled','CANCELED',4)) c(name,category,position);
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER m06_seed_project_statuses AFTER INSERT ON workspaces FOR EACH ROW EXECUTE FUNCTION seed_project_statuses();
--> statement-breakpoint
CREATE FUNCTION require_project_default() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE wid text;
BEGIN
  IF TG_TABLE_NAME='workspaces' THEN wid:=COALESCE(NEW.id,OLD.id); ELSE wid:=COALESCE(NEW.workspace_id,OLD.workspace_id); END IF;
  PERFORM 1 FROM workspaces WHERE id=wid FOR UPDATE;
  IF EXISTS(SELECT 1 FROM workspaces WHERE id=wid AND deleted_at IS NULL AND archived_at IS NULL) AND
    (SELECT count(*) FROM project_statuses WHERE workspace_id=wid AND is_default AND archived_at IS NULL AND category='PLANNED')<>1 THEN
    RAISE EXCEPTION 'An active workspace requires one usable project default' USING ERRCODE='23514',CONSTRAINT='m06_project_default';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER m06_project_default_status AFTER INSERT OR UPDATE OR DELETE ON project_statuses DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_project_default();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER m06_project_default_workspace AFTER INSERT OR UPDATE ON workspaces DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_project_default();
--> statement-breakpoint
CREATE FUNCTION guard_project_status() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE category project_status; status_archived timestamptz;
BEGIN
  SELECT s.category,s.archived_at INTO category,status_archived FROM project_statuses s WHERE s.id=NEW.status_id AND s.workspace_id=NEW.workspace_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid project status' USING ERRCODE='23514',CONSTRAINT='m06_project_status'; END IF;
  IF status_archived IS NOT NULL AND (TG_OP='INSERT' OR NEW.status_id IS DISTINCT FROM OLD.status_id OR (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL)) THEN
    RAISE EXCEPTION 'Archived project statuses cannot receive work' USING ERRCODE='23514',CONSTRAINT='m06_project_status';
  END IF;
  NEW.status:=category;
  IF category='COMPLETED' THEN NEW.completed_at:=COALESCE(NEW.completed_at,now()); ELSE NEW.completed_at:=NULL; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER m06_project_status_projection BEFORE INSERT OR UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION guard_project_status();
--> statement-breakpoint
CREATE FUNCTION require_project_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pid text; p projects%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='projects' THEN pid:=COALESCE(NEW.id,OLD.id); ELSE pid:=COALESCE(NEW.project_id,OLD.project_id); END IF;
  SELECT * INTO p FROM projects WHERE id=pid FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF p.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM project_teams pt JOIN teams t ON t.id=pt.team_id AND t.workspace_id=p.workspace_id AND t.retired_at IS NULL WHERE pt.project_id=pid) THEN
    RAISE EXCEPTION 'An undeleted project requires an active linked team' USING ERRCODE='23514',CONSTRAINT='m06_project_team_required';
  END IF;
  IF (p.deleted_at IS NOT NULL OR p.archived_at IS NOT NULL OR p.status IN ('COMPLETED','CANCELED')) AND EXISTS(SELECT 1 FROM issues i JOIN issue_statuses s ON s.id=i.status_id WHERE i.project_id=pid AND i.deleted_at IS NULL AND s.category NOT IN ('COMPLETED','CANCELED','DUPLICATE')) THEN
    RAISE EXCEPTION 'Project lifecycle transition requires unfinished issues to be resolved explicitly' USING ERRCODE='23514',CONSTRAINT='m06_project_unfinished_issues';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER m06_project_integrity AFTER INSERT OR UPDATE ON projects DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_project_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER m06_project_team_integrity AFTER INSERT OR UPDATE OR DELETE ON project_teams DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_project_integrity();
--> statement-breakpoint
CREATE FUNCTION guard_project_team_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM projects WHERE id=NEW.project_id AND workspace_id=NEW.workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid project association' USING ERRCODE='23514',CONSTRAINT='m06_project_team'; END IF;
  PERFORM 1 FROM teams WHERE id=NEW.team_id AND workspace_id=NEW.workspace_id AND retired_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Team is unavailable for new project associations' USING ERRCODE='23514',CONSTRAINT='m06_project_team'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER m06_project_team_link BEFORE INSERT OR UPDATE ON project_teams FOR EACH ROW EXECUTE FUNCTION guard_project_team_link();
--> statement-breakpoint
CREATE FUNCTION guard_issue_project_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p projects%ROWTYPE;
BEGIN
  IF NEW.project_id IS NOT NULL AND NEW.deleted_at IS NULL AND (TG_OP='INSERT' OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.milestone_id IS DISTINCT FROM OLD.milestone_id OR OLD.deleted_at IS NOT NULL) THEN
    SELECT * INTO p FROM projects WHERE id=NEW.project_id AND workspace_id=NEW.workspace_id FOR UPDATE;
    IF NOT FOUND OR p.deleted_at IS NOT NULL OR p.archived_at IS NOT NULL OR p.status IN ('COMPLETED','CANCELED') THEN
      RAISE EXCEPTION 'Project cannot receive new work' USING ERRCODE='23514',CONSTRAINT='m06_issue_project';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER m06_issue_project_assignment BEFORE INSERT OR UPDATE ON issues FOR EACH ROW EXECUTE FUNCTION guard_issue_project_assignment();
--> statement-breakpoint
CREATE FUNCTION guard_project_status_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM projects WHERE status_id=OLD.id) AND (TG_OP='DELETE' OR NEW.category IS DISTINCT FROM OLD.category OR NEW.archived_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Referenced project status requires explicit replacement' USING ERRCODE='23514',CONSTRAINT='m06_project_status_in_use';
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
--> statement-breakpoint
CREATE TRIGGER m06_project_status_mutation BEFORE UPDATE OR DELETE ON project_statuses FOR EACH ROW EXECUTE FUNCTION guard_project_status_mutation();
--> statement-breakpoint
CREATE FUNCTION guard_project_scoped_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR
    (TG_TABLE_NAME IN ('project_teams','project_members','project_milestones','project_updates') AND to_jsonb(NEW)->>'project_id' IS DISTINCT FROM to_jsonb(OLD)->>'project_id') THEN
    RAISE EXCEPTION 'Project resource identity and scope are immutable' USING ERRCODE='23514',CONSTRAINT='m06_project_identity';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER m06_project_identity BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION guard_project_scoped_identity();
--> statement-breakpoint
CREATE TRIGGER m06_project_status_identity BEFORE UPDATE ON project_statuses FOR EACH ROW EXECUTE FUNCTION guard_project_scoped_identity();
--> statement-breakpoint
CREATE TRIGGER m06_project_team_identity BEFORE UPDATE ON project_teams FOR EACH ROW EXECUTE FUNCTION guard_project_scoped_identity();
--> statement-breakpoint
CREATE TRIGGER m06_project_member_identity BEFORE UPDATE ON project_members FOR EACH ROW EXECUTE FUNCTION guard_project_scoped_identity();
--> statement-breakpoint
CREATE TRIGGER m06_project_milestone_identity BEFORE UPDATE ON project_milestones FOR EACH ROW EXECUTE FUNCTION guard_project_scoped_identity();
--> statement-breakpoint
CREATE TRIGGER m06_project_update_identity BEFORE UPDATE ON project_updates FOR EACH ROW EXECUTE FUNCTION guard_project_scoped_identity();
--> statement-breakpoint
-- Issue status changes must not reintroduce unfinished work into a terminal project.
CREATE CONSTRAINT TRIGGER m06_issue_project_integrity AFTER INSERT OR UPDATE OR DELETE ON issues DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_project_integrity();
--> statement-breakpoint
CREATE FUNCTION guard_issue_category_project_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE project_row record;
BEGIN
  IF NEW.category IS DISTINCT FROM OLD.category AND NEW.category NOT IN ('COMPLETED','CANCELED','DUPLICATE') THEN
    FOR project_row IN SELECT DISTINCT p.id FROM projects p JOIN issues i ON i.project_id=p.id WHERE i.status_id=NEW.id AND i.deleted_at IS NULL ORDER BY p.id LOOP
      PERFORM 1 FROM projects WHERE id=project_row.id FOR UPDATE;
    END LOOP;
    IF EXISTS(SELECT 1 FROM projects p JOIN issues i ON i.project_id=p.id WHERE i.status_id=NEW.id AND i.deleted_at IS NULL AND (p.status IN ('COMPLETED','CANCELED') OR p.archived_at IS NOT NULL OR p.deleted_at IS NOT NULL)) THEN
      RAISE EXCEPTION 'Status category change would reopen work in a closed project' USING ERRCODE='23514',CONSTRAINT='m06_project_unfinished_issues';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER m06_issue_category_project_lifecycle BEFORE UPDATE ON issue_statuses FOR EACH ROW EXECUTE FUNCTION guard_issue_category_project_lifecycle();
