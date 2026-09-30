-- Legacy facts retain null version metadata and require explicit reconciliation.
UPDATE event_dispatch_attempts SET status='FAILED', locked_at=NULL, locked_by=NULL, last_error='Legacy contract requires reconciliation' WHERE consumer_key LIKE 'legacy:%';
--> statement-breakpoint
-- Custom SQL migration file, put your code below! --
-- Migration-only guards: Drizzle cannot represent deferred constraint triggers.
CREATE UNIQUE INDEX memberships_workspace_id_id_idx ON memberships(workspace_id,id);
--> statement-breakpoint
ALTER TABLE events ADD CONSTRAINT events_actor_tenant_fk FOREIGN KEY(workspace_id,actor_id) REFERENCES memberships(workspace_id,id);
--> statement-breakpoint
ALTER TABLE audit_logs ADD CONSTRAINT audit_actor_tenant_fk FOREIGN KEY(workspace_id,actor_id) REFERENCES memberships(workspace_id,id);
--> statement-breakpoint
--> statement-breakpoint
--> statement-breakpoint
CREATE FUNCTION reject_fact_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Immutable facts cannot be updated or deleted' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER events_append_only BEFORE UPDATE OR DELETE ON events FOR EACH ROW EXECUTE FUNCTION reject_fact_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_fact_mutation();
--> statement-breakpoint
CREATE FUNCTION require_active_workspace_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id text;
BEGIN
  IF TG_TABLE_NAME = 'workspaces' THEN target_id := NEW.id;
  ELSE target_id := COALESCE(NEW.workspace_id, OLD.workspace_id); END IF;
  -- Serialize the owner check with every ownership change. Services acquire this
  -- same parent lock before command authorization and mutation.
  PERFORM id FROM workspaces WHERE id = target_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM workspaces WHERE id = target_id AND deleted_at IS NULL AND archived_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM memberships WHERE workspace_id = target_id AND role = 'OWNER' AND state = 'ACTIVE') THEN
    RAISE EXCEPTION 'An active workspace requires an active owner' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER memberships_require_owner AFTER INSERT OR UPDATE OR DELETE ON memberships DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_active_workspace_owner();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER workspaces_require_owner AFTER INSERT OR UPDATE ON workspaces DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_active_workspace_owner();
--> statement-breakpoint
ALTER TABLE auth_tokens ADD CONSTRAINT auth_token_kind CHECK (kind IN ('verify-email','password-reset','magic-link'));
--> statement-breakpoint
ALTER TABLE auth_mail_deliveries ADD CONSTRAINT auth_mail_state CHECK (state IN ('PENDING','CLAIMED','SENT','FAILED'));
--> statement-breakpoint
ALTER TABLE auth_rate_buckets ADD CONSTRAINT auth_rate_attempts_nonnegative CHECK (attempts >= 0);
