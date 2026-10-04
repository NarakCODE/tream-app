-- All graph/catalog commands serialize on the workspace before locking teams.
-- Windows are half-open; adjacent cycles are legal, overlapping live cycles are not.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE cycles ADD CONSTRAINT m08_cycle_window EXCLUDE USING gist(team_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE (canceled_at IS NULL);
--> statement-breakpoint
CREATE FUNCTION reserve_issue_identifier() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE team_key text; reserved_issue text;
BEGIN
  SELECT key INTO team_key FROM teams WHERE id=NEW.team_id AND workspace_id=NEW.workspace_id FOR UPDATE;
  IF NEW.identifier <> team_key || '-' || NEW.number::text THEN
    RAISE EXCEPTION 'Identifier must match the allocated team number' USING ERRCODE='23514',CONSTRAINT='m07_identifier_format';
  END IF;
  SELECT issue_id INTO reserved_issue FROM issue_identifiers WHERE workspace_id=NEW.workspace_id AND identifier=NEW.identifier;
  IF reserved_issue IS NOT NULL AND reserved_issue<>NEW.id THEN
    RAISE EXCEPTION 'Identifier is permanently reserved' USING ERRCODE='23514',CONSTRAINT='m07_identifier_reserved';
  END IF;
  UPDATE teams SET next_issue_number=GREATEST(next_issue_number,NEW.number+1) WHERE id=NEW.team_id;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER m07_identifier_reserve BEFORE INSERT OR UPDATE OF identifier,team_id,number ON issues FOR EACH ROW EXECUTE FUNCTION reserve_issue_identifier();
--> statement-breakpoint
CREATE FUNCTION materialize_issue_identifier() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE issue_identifiers SET is_current=false,updated_at=now() WHERE issue_id=NEW.id AND is_current AND identifier<>NEW.identifier;
  INSERT INTO issue_identifiers(id,workspace_id,issue_id,identifier,is_current) VALUES(gen_random_uuid()::text,NEW.workspace_id,NEW.id,NEW.identifier,true)
  ON CONFLICT(workspace_id,identifier) DO UPDATE SET is_current=true,updated_at=now() WHERE issue_identifiers.issue_id=NEW.id;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER m07_identifier_projection AFTER INSERT OR UPDATE OF identifier ON issues FOR EACH ROW EXECUTE FUNCTION materialize_issue_identifier();
--> statement-breakpoint
CREATE FUNCTION protect_issue_identifier() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Identifier reservations cannot be deleted' USING ERRCODE='23514',CONSTRAINT='m07_identifier_immutable'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.issue_id IS DISTINCT FROM OLD.issue_id OR NEW.identifier IS DISTINCT FROM OLD.identifier THEN
    RAISE EXCEPTION 'Identifier reservations are immutable' USING ERRCODE='23514',CONSTRAINT='m07_identifier_immutable';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER m07_identifier_immutable BEFORE UPDATE OR DELETE ON issue_identifiers FOR EACH ROW EXECUTE FUNCTION protect_issue_identifier();
--> statement-breakpoint
CREATE FUNCTION require_current_identifier() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE iid text;
BEGIN
  IF TG_TABLE_NAME='issues' THEN iid:=COALESCE(NEW.id,OLD.id); ELSE iid:=COALESCE(NEW.issue_id,OLD.issue_id); END IF;
  IF EXISTS(SELECT 1 FROM issues i WHERE i.id=iid AND NOT EXISTS(SELECT 1 FROM issue_identifiers r WHERE r.issue_id=i.id AND r.workspace_id=i.workspace_id AND r.identifier=i.identifier AND r.is_current)) THEN
    RAISE EXCEPTION 'Issue requires its current permanent identifier' USING ERRCODE='23514',CONSTRAINT='m07_identifier_current';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER m07_issue_current_identifier AFTER INSERT OR UPDATE ON issues DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_current_identifier();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER m07_registry_current_identifier AFTER INSERT OR UPDATE OR DELETE ON issue_identifiers DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_current_identifier();
--> statement-breakpoint
CREATE FUNCTION guard_issue_graph() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM workspaces WHERE id=NEW.workspace_id FOR UPDATE;
  IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.workspace_id<>OLD.workspace_id) THEN RAISE EXCEPTION 'Issue tenant identity is immutable' USING ERRCODE='23514',CONSTRAINT='m07_issue_identity'; END IF;
  IF NEW.parent_id IS NOT NULL AND EXISTS(WITH RECURSIVE ancestors AS (SELECT id,parent_id FROM issues WHERE id=NEW.parent_id AND workspace_id=NEW.workspace_id UNION SELECT i.id,i.parent_id FROM issues i JOIN ancestors a ON i.id=a.parent_id) SELECT 1 FROM ancestors WHERE id=NEW.id) THEN
    RAISE EXCEPTION 'Issue parent hierarchy cannot contain cycles' USING ERRCODE='23514',CONSTRAINT='m07_parent_cycle';
  END IF;
  IF NEW.assignee_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id OR (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL)) AND NOT EXISTS(SELECT 1 FROM memberships WHERE id=NEW.assignee_id AND workspace_id=NEW.workspace_id AND state='ACTIVE') THEN
    RAISE EXCEPTION 'Assignee must be an active workspace member' USING ERRCODE='23514',CONSTRAINT='m07_assignee_active';
  END IF;
  IF NEW.cycle_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.cycle_id IS DISTINCT FROM OLD.cycle_id OR (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL)) AND NOT EXISTS(SELECT 1 FROM cycles WHERE id=NEW.cycle_id AND team_id=NEW.team_id AND workspace_id=NEW.workspace_id AND completed_at IS NULL AND canceled_at IS NULL) THEN
    RAISE EXCEPTION 'Issues can only enter usable cycles' USING ERRCODE='23514',CONSTRAINT='m08_cycle_usable';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER m07_issue_graph BEFORE INSERT OR UPDATE ON issues FOR EACH ROW EXECUTE FUNCTION guard_issue_graph();
--> statement-breakpoint
CREATE FUNCTION guard_issue_relation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE other text;
BEGIN
  PERFORM 1 FROM workspaces WHERE id=NEW.workspace_id FOR UPDATE;
  IF NEW.type='RELATED' AND NEW.source_issue_id>NEW.target_issue_id THEN other:=NEW.source_issue_id; NEW.source_issue_id:=NEW.target_issue_id; NEW.target_issue_id:=other; END IF;
  IF NEW.type='BLOCKS' AND EXISTS(WITH RECURSIVE dependencies AS (SELECT target_issue_id AS id FROM issue_relations WHERE workspace_id=NEW.workspace_id AND source_issue_id=NEW.target_issue_id AND type='BLOCKS' AND id<>NEW.id UNION SELECT r.target_issue_id FROM issue_relations r JOIN dependencies d ON r.source_issue_id=d.id WHERE r.workspace_id=NEW.workspace_id AND r.type='BLOCKS' AND r.id<>NEW.id) SELECT 1 FROM dependencies WHERE id=NEW.source_issue_id) THEN
    RAISE EXCEPTION 'Dependencies cannot contain cycles' USING ERRCODE='23514',CONSTRAINT='m07_dependency_cycle';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER m07_relation_graph BEFORE INSERT OR UPDATE ON issue_relations FOR EACH ROW EXECUTE FUNCTION guard_issue_relation();
--> statement-breakpoint
CREATE FUNCTION guard_cycle_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.workspace_id<>OLD.workspace_id OR NEW.team_id<>OLD.team_id OR NEW.number<>OLD.number THEN RAISE EXCEPTION 'Cycle identity is immutable' USING ERRCODE='23514',CONSTRAINT='m08_cycle_identity'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER m08_cycle_identity BEFORE UPDATE ON cycles FOR EACH ROW EXECUTE FUNCTION guard_cycle_identity();
--> statement-breakpoint
CREATE FUNCTION immutable_work_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Work history is append-only' USING ERRCODE='23514',CONSTRAINT='m08_work_history_immutable';
END $$;
--> statement-breakpoint
CREATE TRIGGER m08_rollover_immutable BEFORE UPDATE OR DELETE ON cycle_rollovers FOR EACH ROW EXECUTE FUNCTION immutable_work_history();
--> statement-breakpoint
CREATE TRIGGER m09_activity_immutable BEFORE UPDATE OR DELETE ON issue_activity FOR EACH ROW EXECUTE FUNCTION immutable_work_history();
--> statement-breakpoint
CREATE FUNCTION guard_comment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent comments%ROWTYPE;
BEGIN
  PERFORM 1 FROM workspaces WHERE id=NEW.workspace_id FOR UPDATE;
  IF TG_OP='UPDATE' AND (NEW.workspace_id<>OLD.workspace_id OR NEW.author_id<>OLD.author_id OR NEW.issue_id IS DISTINCT FROM OLD.issue_id OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.project_update_id IS DISTINCT FROM OLD.project_update_id) THEN
    RAISE EXCEPTION 'Comment attribution and target are immutable' USING ERRCODE='23514',CONSTRAINT='m09_comment_identity';
  END IF;
  IF NEW.project_update_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM project_updates WHERE id=NEW.project_update_id AND workspace_id=NEW.workspace_id) THEN RAISE EXCEPTION 'Comment update must belong to the workspace' USING ERRCODE='23514',CONSTRAINT='m09_comment_update_target'; END IF;
  IF NEW.parent_comment_id IS NOT NULL THEN
    SELECT * INTO parent FROM comments WHERE id=NEW.parent_comment_id AND workspace_id=NEW.workspace_id;
    IF NOT FOUND OR parent.issue_id IS DISTINCT FROM NEW.issue_id OR parent.project_id IS DISTINCT FROM NEW.project_id OR parent.project_update_id IS DISTINCT FROM NEW.project_update_id OR (parent.deleted_at IS NOT NULL AND (TG_OP='INSERT' OR NEW.parent_comment_id IS DISTINCT FROM OLD.parent_comment_id)) THEN
      RAISE EXCEPTION 'Reply requires a usable comment on the same target' USING ERRCODE='23514',CONSTRAINT='m09_comment_parent_target';
    END IF;
    IF EXISTS(WITH RECURSIVE ancestors AS (SELECT id,parent_comment_id FROM comments WHERE id=NEW.parent_comment_id UNION SELECT c.id,c.parent_comment_id FROM comments c JOIN ancestors a ON c.id=a.parent_comment_id) SELECT 1 FROM ancestors WHERE id=NEW.id) THEN RAISE EXCEPTION 'Replies cannot contain cycles' USING ERRCODE='23514',CONSTRAINT='m09_comment_parent_cycle'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER m09_comment_guard BEFORE INSERT OR UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION guard_comment();
--> statement-breakpoint
CREATE FUNCTION require_label_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE wid text;
BEGIN
  wid:=COALESCE(NEW.workspace_id,OLD.workspace_id);
  PERFORM 1 FROM workspaces WHERE id=wid FOR UPDATE;
  IF EXISTS(SELECT 1 FROM issue_labels il JOIN issues i ON i.id=il.issue_id JOIN labels l ON l.id=il.label_id WHERE il.workspace_id=wid AND l.team_id IS NOT NULL AND l.team_id<>i.team_id) OR EXISTS(SELECT 1 FROM project_labels pl JOIN labels l ON l.id=pl.label_id WHERE pl.workspace_id=wid AND l.team_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Label scope must match its target' USING ERRCODE='23514',CONSTRAINT='m09_label_scope';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER m09_issue_label_scope AFTER INSERT OR UPDATE ON issue_labels DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_label_scope();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER m09_project_label_scope AFTER INSERT OR UPDATE ON project_labels DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_label_scope();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER m09_label_edit_scope AFTER UPDATE ON labels DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_label_scope();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER m09_issue_transfer_scope AFTER UPDATE ON issues DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_label_scope();
--> statement-breakpoint
-- Legacy/internal callers get a revision automatically. Explicit writers may
-- supply exactly old+1; regressions and jumps are rejected independently of API.
CREATE FUNCTION advance_work_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='cycles' AND NEW.revision=OLD.revision AND (to_jsonb(NEW)-ARRAY['scheduler_error','scheduler_failed_at','updated_at'])=(to_jsonb(OLD)-ARRAY['scheduler_error','scheduler_failed_at','updated_at']) THEN RETURN NEW; END IF;
  IF NEW.revision=OLD.revision THEN NEW.revision:=OLD.revision+1;
  ELSIF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Revision must advance by one' USING ERRCODE='23514',CONSTRAINT='m07_revision_monotonic'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER m07_issue_revision_advance BEFORE UPDATE ON issues FOR EACH ROW EXECUTE FUNCTION advance_work_revision();
--> statement-breakpoint
CREATE TRIGGER m08_cycle_revision_advance BEFORE UPDATE ON cycles FOR EACH ROW EXECUTE FUNCTION advance_work_revision();
--> statement-breakpoint
CREATE TRIGGER m09_comment_revision_advance BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION advance_work_revision();
--> statement-breakpoint
CREATE TRIGGER m09_label_revision_advance BEFORE UPDATE ON labels FOR EACH ROW EXECUTE FUNCTION advance_work_revision();
--> statement-breakpoint
CREATE TRIGGER m09_template_revision_advance BEFORE UPDATE ON issue_templates FOR EACH ROW EXECUTE FUNCTION advance_work_revision();
--> statement-breakpoint
CREATE FUNCTION guard_label_link() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE l labels%ROWTYPE;
BEGIN
  PERFORM 1 FROM workspaces WHERE id=NEW.workspace_id FOR UPDATE;
  SELECT * INTO l FROM labels WHERE id=NEW.label_id AND workspace_id=NEW.workspace_id FOR SHARE;
  IF NOT FOUND OR l.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Only active labels may be linked' USING ERRCODE='23514',CONSTRAINT='m09_label_active'; END IF;
  IF TG_TABLE_NAME='issue_labels' THEN
    IF NOT EXISTS(SELECT 1 FROM issues WHERE id=NEW.issue_id AND workspace_id=NEW.workspace_id AND deleted_at IS NULL AND archived_at IS NULL AND (l.team_id IS NULL OR l.team_id=team_id)) THEN RAISE EXCEPTION 'Label requires a usable compatible issue' USING ERRCODE='23514',CONSTRAINT='m09_label_scope'; END IF;
  ELSE
    IF l.team_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM projects WHERE id=NEW.project_id AND workspace_id=NEW.workspace_id AND deleted_at IS NULL AND archived_at IS NULL) THEN RAISE EXCEPTION 'Project labels must be usable workspace labels' USING ERRCODE='23514',CONSTRAINT='m09_label_scope'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER m09_issue_label_guard BEFORE INSERT OR UPDATE ON issue_labels FOR EACH ROW EXECUTE FUNCTION guard_label_link();
--> statement-breakpoint
CREATE TRIGGER m09_project_label_guard BEFORE INSERT OR UPDATE ON project_labels FOR EACH ROW EXECUTE FUNCTION guard_label_link();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_team_retirement_with_work() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.retired_at IS NOT NULL AND (EXISTS(SELECT FROM issues i JOIN issue_statuses s ON s.id=i.status_id WHERE i.team_id=NEW.id AND i.deleted_at IS NULL AND s.category NOT IN('COMPLETED','CANCELED','DUPLICATE'))
 OR EXISTS(SELECT FROM project_teams pt JOIN projects p ON p.id=pt.project_id WHERE pt.team_id=NEW.id AND p.deleted_at IS NULL)
 OR EXISTS(SELECT FROM cycles WHERE team_id=NEW.id AND completed_at IS NULL AND canceled_at IS NULL)) THEN
  RAISE EXCEPTION 'Team retirement requires resolving live dependencies' USING ERRCODE='23514',CONSTRAINT='m05_team_dependencies';
 END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE FUNCTION guard_new_cycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM teams WHERE id=NEW.team_id AND workspace_id=NEW.workspace_id AND retired_at IS NULL) THEN RAISE EXCEPTION 'Retired teams cannot receive cycles' USING ERRCODE='23514',CONSTRAINT='m08_cycle_team_active'; END IF;
  IF TG_OP='UPDATE' AND (OLD.completed_at IS NOT NULL OR OLD.canceled_at IS NOT NULL) AND (NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.ends_at IS DISTINCT FROM OLD.ends_at OR NEW.completed_at IS DISTINCT FROM OLD.completed_at OR NEW.canceled_at IS DISTINCT FROM OLD.canceled_at) THEN RAISE EXCEPTION 'Finished cycle windows and terminal state are immutable' USING ERRCODE='23514',CONSTRAINT='m08_cycle_terminal'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER m08_cycle_usable_guard BEFORE INSERT OR UPDATE ON cycles FOR EACH ROW EXECUTE FUNCTION guard_new_cycle();
--> statement-breakpoint
CREATE FUNCTION guard_issue_activity_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM events WHERE id=NEW.event_id AND workspace_id=NEW.workspace_id) THEN RAISE EXCEPTION 'Activity requires an event in its workspace' USING ERRCODE='23514',CONSTRAINT='m09_activity_event_tenant'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER m09_activity_event_guard BEFORE INSERT ON issue_activity FOR EACH ROW EXECUTE FUNCTION guard_issue_activity_event();
