-- Proposed TARGET schema supplement; not an incremental application migration.
-- Apply after the DBML export and postgresql-constraints.sql in a disposable DB.
-- Application roles must not own tables, disable triggers, or TRUNCATE history.
BEGIN;

-- The registry includes current and old aliases. Deferral breaks the intentional
-- issues -> registry -> issues insertion cycle; the AFTER trigger supplies the row.
ALTER TABLE public.issues
  ADD CONSTRAINT issues_current_identifier_owned
  FOREIGN KEY (workspace_id, id, identifier)
  REFERENCES public.issue_identifiers (workspace_id, issue_id, identifier)
  DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION public.protect_team_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Retire teams; their keys are permanently reserved' USING ERRCODE = '23514';
  END IF;
  IF (NEW.id, NEW.workspace_id, NEW.key) IS DISTINCT FROM (OLD.id, OLD.workspace_id, OLD.key) THEN
    RAISE EXCEPTION 'Team identity and key are immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.next_issue_number < OLD.next_issue_number THEN
    RAISE EXCEPTION 'Issue number allocator cannot decrease' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER teams_protect_identity
  BEFORE UPDATE OR DELETE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.protect_team_identity();

CREATE FUNCTION public.validate_issue_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE target_key text;
BEGIN
  IF TG_OP = 'UPDATE' AND
     (NEW.id, NEW.workspace_id) IS DISTINCT FROM (OLD.id, OLD.workspace_id) THEN
    RAISE EXCEPTION 'Issue identity and workspace are immutable' USING ERRCODE = '23514';
  END IF;
  SELECT key INTO target_key FROM public.teams
    WHERE workspace_id = NEW.workspace_id AND id = NEW.team_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Issue team must belong to its workspace' USING ERRCODE = '23503';
  END IF;
  IF NEW.identifier IS DISTINCT FROM target_key || '-' || NEW.number::text THEN
    RAISE EXCEPTION 'Issue identifier must match team key and number' USING ERRCODE = '23514';
  END IF;
  IF NEW.number < 1 OR NEW.number >= 9223372036854775807 THEN
    RAISE EXCEPTION 'Issue number is outside allocator range' USING ERRCODE = '23514';
  END IF;
  -- Explicit service reservations and imported numbers both leave a safe allocator.
  -- Allocation remains SELECT ... FOR UPDATE / UPDATE ... RETURNING in the service.
  UPDATE public.teams SET next_issue_number = GREATEST(next_issue_number, NEW.number + 1)
    WHERE workspace_id = NEW.workspace_id AND id = NEW.team_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER issues_validate_identity
  BEFORE INSERT OR UPDATE OF id, workspace_id, team_id, number, identifier ON public.issues
  FOR EACH ROW EXECUTE FUNCTION public.validate_issue_identity();

CREATE FUNCTION public.reserve_issue_identifier() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE reserved_owner text;
BEGIN
  -- Internal ID is an injective length-prefixed key, not an API-facing ULID.
  INSERT INTO public.issue_identifiers (id, workspace_id, issue_id, identifier)
    VALUES ('iid_' || length(NEW.id)::text || ':' || NEW.id || NEW.identifier,
      NEW.workspace_id, NEW.id, NEW.identifier)
    ON CONFLICT (workspace_id, identifier) DO NOTHING;
  SELECT issue_id INTO reserved_owner FROM public.issue_identifiers
    WHERE workspace_id = NEW.workspace_id AND identifier = NEW.identifier;
  IF reserved_owner IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'Issue identifier is permanently reserved by another issue'
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER issues_reserve_identifier
  AFTER INSERT OR UPDATE OF identifier ON public.issues
  FOR EACH ROW EXECUTE FUNCTION public.reserve_issue_identifier();

CREATE FUNCTION public.protect_identifier_history() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM public.issues
      WHERE workspace_id = NEW.workspace_id AND id = NEW.issue_id AND identifier = NEW.identifier) THEN
      RAISE EXCEPTION 'Reservations may only capture the current identifier of their owning issue'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Issue identifier reservations are immutable; retain issue tombstones'
    USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER issue_identifiers_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.issue_identifiers
  FOR EACH ROW EXECUTE FUNCTION public.protect_identifier_history();
COMMIT;
