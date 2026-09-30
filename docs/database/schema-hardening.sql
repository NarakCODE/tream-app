-- Proposed target supplement; apply after DBML export, postgresql-constraints.sql,
-- and transactional-integrity.sql. Not an application migration.
BEGIN;

CREATE UNIQUE INDEX users_normalized_email ON public.users (lower(btrim(email)));
-- DBML enforces canonical lowercase workspace slugs; its ordinary UNIQUE suffices.

-- Targeted keyset/query paths. Existing DBML FK/unique indexes are retained.
CREATE INDEX issues_live_team_board ON public.issues
  (workspace_id, team_id, status_id, sort_order, id)
  WHERE archived_at IS NULL AND deleted_at IS NULL;
CREATE INDEX issues_live_assignee_queue ON public.issues
  (workspace_id, assignee_id, updated_at DESC, id)
  WHERE assignee_id IS NOT NULL AND archived_at IS NULL AND deleted_at IS NULL;
CREATE INDEX issues_live_project_board ON public.issues
  (workspace_id, project_id, status_id, sort_order, id)
  WHERE project_id IS NOT NULL AND archived_at IS NULL AND deleted_at IS NULL;
CREATE INDEX issues_parent_lookup ON public.issues (workspace_id, parent_id, id)
  WHERE parent_id IS NOT NULL;
CREATE INDEX issue_comments_thread_page ON public.issue_comments
  (workspace_id, issue_id, created_at, id) WHERE deleted_at IS NULL;
CREATE INDEX issue_activity_history_page ON public.issue_activity
  (workspace_id, issue_id, created_at DESC, id);
CREATE INDEX notifications_live_inbox_page ON public.notifications
  (workspace_id, recipient_id, created_at DESC, id) WHERE archived_at IS NULL;
CREATE INDEX event_dispatch_ready_jobs ON public.event_dispatch_attempts
  (available_at, created_at, id) WHERE status IN ('PENDING', 'FAILED');
CREATE INDEX event_dispatch_stale_leases ON public.event_dispatch_attempts
  (locked_at, id) WHERE status = 'PROCESSING';
CREATE INDEX dynamic_records_live_database_page ON public.dynamic_records
  (workspace_id, database_id, created_at DESC, id)
  WHERE archived_at IS NULL AND deleted_at IS NULL;

-- FOR SHARE (not KEY SHARE) conflicts with non-key edits to type/target/team.
-- Link insertion validates the latest locked parent. Parent edits inspect links
-- while holding their UPDATE row lock. READ COMMITTED is the supported protocol;
-- SERIALIZABLE is also valid with retry. REPEATABLE READ is not supported for
-- these multi-row write paths. Acquire parent rows before link writes, in stable
-- ID order, and retry deadlocks/serialization failures. Never disable triggers.
CREATE FUNCTION public.validate_dynamic_typed_link() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE field_kind public.dynamic_field_type; configured_target text;
BEGIN
  IF current_setting('transaction_isolation') = 'repeatable read' THEN
    RAISE EXCEPTION 'Scoped link writes require READ COMMITTED or SERIALIZABLE with retry' USING ERRCODE = '25001';
  END IF;
  SELECT type, relation_database_id INTO field_kind, configured_target
    FROM public.dynamic_fields
    WHERE workspace_id = NEW.workspace_id AND database_id = NEW.database_id AND id = NEW.field_id
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Typed link field must belong to its source database' USING ERRCODE = '23503';
  END IF;
  IF TG_TABLE_NAME = 'dynamic_record_relations' THEN
    IF field_kind <> 'RELATION' OR NEW.target_database_id IS DISTINCT FROM configured_target THEN
      RAISE EXCEPTION 'Relation link must match field type and configured target database' USING ERRCODE = '23514';
    END IF;
  ELSIF field_kind <> 'USER' THEN
    RAISE EXCEPTION 'User link requires USER field' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER dynamic_relations_validate_field
  BEFORE INSERT OR UPDATE ON public.dynamic_record_relations
  FOR EACH ROW EXECUTE FUNCTION public.validate_dynamic_typed_link();
CREATE TRIGGER dynamic_users_validate_field
  BEFORE INSERT OR UPDATE ON public.dynamic_record_users
  FOR EACH ROW EXECUTE FUNCTION public.validate_dynamic_typed_link();

CREATE FUNCTION public.protect_dynamic_field_links() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF current_setting('transaction_isolation') = 'repeatable read' THEN
    RAISE EXCEPTION 'Scoped link writes require READ COMMITTED or SERIALIZABLE with retry' USING ERRCODE = '25001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dynamic_record_relations r
    WHERE r.workspace_id = OLD.workspace_id AND r.field_id = OLD.id
      AND (NEW.type <> 'RELATION' OR r.target_database_id IS DISTINCT FROM NEW.relation_database_id))
    OR EXISTS (SELECT 1 FROM public.dynamic_record_users u
      WHERE u.workspace_id = OLD.workspace_id AND u.field_id = OLD.id AND NEW.type <> 'USER') THEN
    RAISE EXCEPTION 'Remove incompatible typed links before changing field definition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER dynamic_fields_protect_links
  BEFORE UPDATE OF type, relation_database_id ON public.dynamic_fields
  FOR EACH ROW EXECUTE FUNCTION public.protect_dynamic_field_links();

CREATE FUNCTION public.validate_label_link() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE label_team text; issue_team text;
BEGIN
  IF current_setting('transaction_isolation') = 'repeatable read' THEN
    RAISE EXCEPTION 'Scoped link writes require READ COMMITTED or SERIALIZABLE with retry' USING ERRCODE = '25001';
  END IF;
  -- All issue-label writers lock issue then label; reverse parent edits acquire
  -- their parent row lock implicitly. Multi-parent commands use stable IDs.
  IF TG_TABLE_NAME = 'issue_labels' THEN
    SELECT team_id INTO issue_team FROM public.issues
      WHERE workspace_id = NEW.workspace_id AND id = NEW.issue_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Issue label requires issue in workspace' USING ERRCODE = '23503';
    END IF;
  END IF;
  SELECT team_id INTO label_team FROM public.labels
    WHERE workspace_id = NEW.workspace_id AND id = NEW.label_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Label must belong to workspace' USING ERRCODE = '23503';
  END IF;
  IF (TG_TABLE_NAME = 'project_labels' AND label_team IS NOT NULL)
    OR (TG_TABLE_NAME = 'issue_labels' AND label_team IS NOT NULL AND label_team IS DISTINCT FROM issue_team) THEN
    RAISE EXCEPTION 'Label scope is incompatible with linked resource' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER issue_labels_validate_scope BEFORE INSERT OR UPDATE ON public.issue_labels
  FOR EACH ROW EXECUTE FUNCTION public.validate_label_link();
CREATE TRIGGER project_labels_validate_scope BEFORE INSERT OR UPDATE ON public.project_labels
  FOR EACH ROW EXECUTE FUNCTION public.validate_label_link();

CREATE FUNCTION public.protect_issue_label_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF current_setting('transaction_isolation') = 'repeatable read' THEN
    RAISE EXCEPTION 'Scoped link writes require READ COMMITTED or SERIALIZABLE with retry' USING ERRCODE = '25001';
  END IF;
  PERFORM l.id FROM public.issue_labels il JOIN public.labels l
    ON l.workspace_id = il.workspace_id AND l.id = il.label_id
    WHERE il.workspace_id = OLD.workspace_id AND il.issue_id = OLD.id
    ORDER BY l.id FOR SHARE OF l;
  IF NEW.team_id IS DISTINCT FROM OLD.team_id AND EXISTS (
    SELECT 1 FROM public.issue_labels il JOIN public.labels l
      ON l.workspace_id = il.workspace_id AND l.id = il.label_id
    WHERE il.workspace_id = OLD.workspace_id AND il.issue_id = OLD.id
      AND l.team_id IS NOT NULL AND l.team_id IS DISTINCT FROM NEW.team_id) THEN
    RAISE EXCEPTION 'Remove old-team labels before transferring issue' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER issues_protect_label_scope BEFORE UPDATE OF team_id ON public.issues
  FOR EACH ROW EXECUTE FUNCTION public.protect_issue_label_scope();

CREATE FUNCTION public.protect_label_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF current_setting('transaction_isolation') = 'repeatable read' THEN
    RAISE EXCEPTION 'Scoped link writes require READ COMMITTED or SERIALIZABLE with retry' USING ERRCODE = '25001';
  END IF;
  PERFORM i.id FROM public.issue_labels il JOIN public.issues i
    ON i.workspace_id = il.workspace_id AND i.id = il.issue_id
    WHERE il.workspace_id = OLD.workspace_id AND il.label_id = OLD.id
    ORDER BY i.id FOR SHARE OF i;
  IF NEW.team_id IS DISTINCT FROM OLD.team_id AND NEW.team_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.project_labels pl
      WHERE pl.workspace_id = OLD.workspace_id AND pl.label_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.issue_labels il JOIN public.issues i
      ON i.workspace_id = il.workspace_id AND i.id = il.issue_id
      WHERE il.workspace_id = OLD.workspace_id AND il.label_id = OLD.id
        AND i.team_id IS DISTINCT FROM NEW.team_id)) THEN
    RAISE EXCEPTION 'Remove incompatible attachments before changing label team' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER labels_protect_scope BEFORE UPDATE OF team_id ON public.labels
  FOR EACH ROW EXECUTE FUNCTION public.protect_label_scope();
COMMIT;
