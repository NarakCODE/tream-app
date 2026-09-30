-- Target-schema supplement. Apply once to a fresh disposable exported schema.
BEGIN;
CREATE FUNCTION public.tream_guard_event_head() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Event stream identities cannot be deleted' USING ERRCODE = '23514';
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.current_version <> 0 THEN
      RAISE EXCEPTION 'Create stream at revision zero' USING ERRCODE = '23514';
    END IF;
  ELSIF (NEW.id, NEW.workspace_id, NEW.aggregate_type, NEW.aggregate_id)
      IS DISTINCT FROM (OLD.id, OLD.workspace_id, OLD.aggregate_type, OLD.aggregate_id)
      OR NEW.current_version <> OLD.current_version + 1 THEN
    RAISE EXCEPTION 'Stream identity is immutable; advance revision exactly once' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER event_heads_guard BEFORE INSERT OR UPDATE OR DELETE
  ON public.event_aggregate_heads FOR EACH ROW EXECUTE FUNCTION public.tream_guard_event_head();

CREATE FUNCTION public.tream_validate_event_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE head_version bigint;
BEGIN
  SELECT current_version INTO head_version FROM public.event_aggregate_heads
    WHERE workspace_id = NEW.workspace_id AND aggregate_type = NEW.aggregate_type
      AND aggregate_id = NEW.aggregate_id FOR SHARE;
  IF head_version IS NULL OR head_version <> NEW.aggregate_version THEN
    RAISE EXCEPTION 'Event must use the locked stream current revision' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER events_revision_guard BEFORE INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.tream_validate_event_revision();

CREATE FUNCTION public.tream_reject_history_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  RAISE EXCEPTION 'History is append-only: %', TG_TABLE_NAME USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER events_immutable BEFORE UPDATE OR DELETE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.tream_reject_history_mutation();
CREATE TRIGGER consumer_receipts_immutable BEFORE UPDATE OR DELETE ON public.event_consumer_receipts
  FOR EACH ROW EXECUTE FUNCTION public.tream_reject_history_mutation();
-- Controlled retention/erasure must be a separate maintenance operation; the normal
-- application role must not own tables, bypass triggers, TRUNCATE, or run DDL.
COMMIT;
