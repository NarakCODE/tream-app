ALTER TABLE "workspaces" ADD COLUMN "purged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "correlation_id" text;--> statement-breakpoint
CREATE INDEX "audit_logs_workspace_correlation_created_idx" ON "audit_logs" USING btree ("workspace_id","correlation_id","created_at","id");--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "m14_workspace_purge_state" CHECK ("workspaces"."purged_at" IS NULL OR ("workspaces"."deleted_at" IS NOT NULL AND "workspaces"."archived_at" IS NULL AND "workspaces"."purged_at" >= "workspaces"."deleted_at" + interval '30 days'));--> statement-breakpoint
-- The worker performs content reconciliation explicitly in its transaction.
-- This trigger only guards the permanent tombstone and never disables fact/FK guards.
CREATE FUNCTION protect_workspace_purge_tombstone() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.purged_at IS NOT NULL AND (NEW.purged_at IS DISTINCT FROM OLD.purged_at OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR NEW.archived_at IS DISTINCT FROM OLD.archived_at) THEN
    RAISE EXCEPTION 'Purged workspace lifecycle is permanent' USING ERRCODE='23514',CONSTRAINT='m14_workspace_purge_immutable';
  END IF;
  IF NEW.purged_at IS NOT NULL AND (NEW.deleted_at IS NULL OR NEW.archived_at IS NOT NULL OR NEW.purged_at < NEW.deleted_at + interval '30 days' OR NEW.purged_at > clock_timestamp()) THEN
    RAISE EXCEPTION 'Workspace purge requires an expired deletion retention window' USING ERRCODE='23514',CONSTRAINT='m14_workspace_purge_state';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER m14_workspace_purge_tombstone BEFORE INSERT OR UPDATE ON workspaces FOR EACH ROW EXECUTE FUNCTION protect_workspace_purge_tombstone();
