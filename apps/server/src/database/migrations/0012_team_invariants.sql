-- Custom SQL migration file, put your code below! --
-- These deferred invariants are migration-owned; Drizzle cannot model them.
ALTER TABLE issues ADD CONSTRAINT issues_team_tenant_fk FOREIGN KEY(workspace_id,team_id) REFERENCES teams(workspace_id,id);
--> statement-breakpoint
ALTER TABLE issues ADD CONSTRAINT issues_status_team_fk FOREIGN KEY(team_id,status_id) REFERENCES issue_statuses(team_id,id);
--> statement-breakpoint
CREATE FUNCTION protect_team_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Team keys are permanently reserved' USING ERRCODE='23514',CONSTRAINT='m05_team_identity';
 END IF;
 IF NEW.key<>OLD.key OR NEW.workspace_id<>OLD.workspace_id OR NEW.id<>OLD.id THEN
  RAISE EXCEPTION 'Team identity is immutable' USING ERRCODE='23514',CONSTRAINT='m05_team_identity';
 END IF;
 IF NEW.next_issue_number<OLD.next_issue_number THEN
  RAISE EXCEPTION 'Issue numbers cannot regress' USING ERRCODE='23514',CONSTRAINT='m05_team_counter';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER teams_identity_guard BEFORE UPDATE OR DELETE ON teams FOR EACH ROW EXECUTE FUNCTION protect_team_identity();
--> statement-breakpoint
CREATE FUNCTION require_usable_team() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id text; team_row teams%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='teams' THEN target_id:=NEW.id;
 ELSE target_id:=COALESCE(NEW.team_id,OLD.team_id); END IF;
 SELECT * INTO team_row FROM teams WHERE id=target_id FOR UPDATE;
 IF NOT FOUND OR team_row.retired_at IS NOT NULL THEN RETURN NULL; END IF;
 IF (SELECT count(*) FROM issue_statuses WHERE team_id=target_id AND is_default AND retired_at IS NULL AND category IN('BACKLOG','UNSTARTED'))<>1 THEN
  RAISE EXCEPTION 'An active team requires one usable default status' USING ERRCODE='23514',CONSTRAINT='m05_team_default';
 END IF;
 IF EXISTS(SELECT FROM workspaces WHERE id=team_row.workspace_id AND archived_at IS NULL AND deleted_at IS NULL)
    AND NOT EXISTS(SELECT FROM team_memberships tm JOIN memberships m ON m.id=tm.membership_id AND m.workspace_id=tm.workspace_id WHERE tm.team_id=target_id AND tm.role='ADMIN' AND m.state='ACTIVE' AND m.role<>'GUEST') THEN
  RAISE EXCEPTION 'An active team requires an active non-guest administrator' USING ERRCODE='23514',CONSTRAINT='m05_team_admin';
 END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER teams_require_usable AFTER INSERT OR UPDATE ON teams DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_usable_team();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER statuses_require_usable AFTER INSERT OR UPDATE OR DELETE ON issue_statuses DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_usable_team();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER team_members_require_usable AFTER INSERT OR UPDATE OR DELETE ON team_memberships DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_usable_team();
--> statement-breakpoint
CREATE FUNCTION check_workspace_team_administration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_workspace text;
BEGIN
 IF TG_TABLE_NAME='workspaces' THEN target_workspace:=NEW.id;
 ELSE target_workspace:=COALESCE(NEW.workspace_id,OLD.workspace_id); END IF;
 PERFORM id FROM workspaces WHERE id=target_workspace FOR UPDATE;
 IF EXISTS(SELECT FROM workspaces WHERE id=target_workspace AND archived_at IS NULL AND deleted_at IS NULL)
 AND EXISTS(SELECT FROM teams t WHERE t.workspace_id=target_workspace AND t.retired_at IS NULL AND NOT EXISTS(SELECT FROM team_memberships tm JOIN memberships m ON m.id=tm.membership_id AND m.workspace_id=tm.workspace_id WHERE tm.team_id=t.id AND tm.role='ADMIN' AND m.state='ACTIVE' AND m.role<>'GUEST')) THEN
  RAISE EXCEPTION 'Membership change would leave a team without administration' USING ERRCODE='23514',CONSTRAINT='m05_team_admin';
 END IF;
 IF EXISTS(SELECT FROM team_memberships tm JOIN memberships m ON m.id=tm.membership_id WHERE tm.workspace_id=target_workspace AND tm.role='ADMIN' AND m.role='GUEST') THEN
  RAISE EXCEPTION 'Guests cannot administer teams' USING ERRCODE='23514',CONSTRAINT='m05_guest_admin';
 END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER memberships_preserve_team_admin AFTER UPDATE OR DELETE ON memberships DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_workspace_team_administration();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER workspaces_preserve_team_admin AFTER UPDATE ON workspaces DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_workspace_team_administration();
--> statement-breakpoint
CREATE FUNCTION guard_team_member() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.role='ADMIN' AND EXISTS(SELECT FROM memberships WHERE id=NEW.membership_id AND role='GUEST') THEN
  RAISE EXCEPTION 'Guests cannot administer teams' USING ERRCODE='23514',CONSTRAINT='m05_guest_admin';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER team_member_guest_guard BEFORE INSERT OR UPDATE ON team_memberships FOR EACH ROW EXECUTE FUNCTION guard_team_member();
--> statement-breakpoint
CREATE FUNCTION guard_issue_team_workflow() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 -- Historical soft-deleted issues retain their references. Any active write must
 -- lock a usable team and status, preventing concurrent retirement/new work.
 IF NEW.deleted_at IS NULL THEN
  PERFORM id FROM teams WHERE id=NEW.team_id AND workspace_id=NEW.workspace_id AND retired_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Issue requires an active team' USING ERRCODE='23514',CONSTRAINT='m05_issue_team'; END IF;
  PERFORM id FROM issue_statuses WHERE id=NEW.status_id AND team_id=NEW.team_id AND retired_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Issue requires an active team status' USING ERRCODE='23514',CONSTRAINT='m05_issue_status'; END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER issues_usable_team_status BEFORE INSERT OR UPDATE ON issues FOR EACH ROW EXECUTE FUNCTION guard_issue_team_workflow();
--> statement-breakpoint
CREATE FUNCTION prevent_status_retirement_in_use() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.retired_at IS NOT NULL AND EXISTS(SELECT FROM issues WHERE status_id=NEW.id) THEN
  RAISE EXCEPTION 'Retired status requires explicit issue replacement' USING ERRCODE='23514',CONSTRAINT='m05_status_in_use';
 END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER statuses_no_retired_references AFTER UPDATE ON issue_statuses DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION prevent_status_retirement_in_use();
--> statement-breakpoint
CREATE FUNCTION prevent_team_retirement_with_work() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.retired_at IS NOT NULL AND (EXISTS(SELECT FROM issues i JOIN issue_statuses s ON s.id=i.status_id WHERE i.team_id=NEW.id AND i.deleted_at IS NULL AND s.category NOT IN('COMPLETED','CANCELED','DUPLICATE'))
 OR EXISTS(SELECT FROM project_teams pt JOIN projects p ON p.id=pt.project_id WHERE pt.team_id=NEW.id AND p.deleted_at IS NULL)
 OR EXISTS(SELECT FROM cycles WHERE team_id=NEW.id AND completed_at IS NULL)) THEN
  RAISE EXCEPTION 'Team retirement requires resolving live dependencies' USING ERRCODE='23514',CONSTRAINT='m05_team_dependencies';
 END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER teams_no_retired_work AFTER UPDATE ON teams DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION prevent_team_retirement_with_work();
