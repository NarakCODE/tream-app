CREATE TYPE "public"."membership_state" AS ENUM('ACTIVE', 'SUSPENDED', 'LEFT');--> statement-breakpoint
ALTER TYPE "public"."event_dispatch_status" ADD VALUE 'QUARANTINED';--> statement-breakpoint
CREATE TABLE "auth_mail_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"encrypted_message" text,
	"state" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"claim_id" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_rate_buckets" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"attempts" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "event_aggregate_heads" (
	"workspace_id" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"revision" integer NOT NULL,
	CONSTRAINT "event_aggregate_heads_revision_positive" CHECK ("event_aggregate_heads"."revision">0)
);
--> statement-breakpoint
CREATE TABLE "event_consumer_receipts" (
	"event_id" text NOT NULL,
	"consumer_key" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"email" text NOT NULL,
	"role" "workspace_role" NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" text NOT NULL,
	"accepted_by" text,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_invitation_normalized_email" CHECK ("workspace_invitations"."email" = lower(trim("workspace_invitations"."email"))),
	CONSTRAINT "workspace_invitation_terminal_exclusive" CHECK ("workspace_invitations"."accepted_at" IS NULL OR "workspace_invitations"."revoked_at" IS NULL),
	CONSTRAINT "workspace_invitation_acceptance_pair" CHECK (("workspace_invitations"."accepted_at" IS NULL) = ("workspace_invitations"."accepted_by" IS NULL)),
	CONSTRAINT "workspace_invitation_expiry" CHECK ("workspace_invitations"."expires_at" > "workspace_invitations"."created_at")
);
--> statement-breakpoint
CREATE TABLE "workspace_preferences" (
	"membership_id" text PRIMARY KEY NOT NULL,
	"preferences" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_selections" (
	"user_id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_event_type_check";--> statement-breakpoint
DROP INDEX "events_workspace_idempotency_key_idx";--> statement-breakpoint
ALTER TABLE "refresh_sessions" ADD COLUMN "family_id" text;--> statement-breakpoint
UPDATE "refresh_sessions" SET "family_id" = "id";--> statement-breakpoint
ALTER TABLE "refresh_sessions" ALTER COLUMN "family_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "refresh_sessions" ADD COLUMN "last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "disabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_dispatch_attempts" ADD COLUMN "consumer_key" text DEFAULT 'internal' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "schema_version" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "actor_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "aggregate_type" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "aggregate_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "aggregate_version" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "correlation_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "occurred_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "state" "membership_state" DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_aggregate_heads" ADD CONSTRAINT "event_aggregate_heads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_consumer_receipts" ADD CONSTRAINT "event_consumer_receipts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_invited_by_memberships_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_accepted_by_memberships_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_preferences" ADD CONSTRAINT "workspace_preferences_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_selections" ADD CONSTRAINT "workspace_selections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_selections" ADD CONSTRAINT "workspace_selections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_aggregate_heads_identity" ON "event_aggregate_heads" USING btree ("workspace_id","aggregate_type","aggregate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_consumer_receipts_identity" ON "event_consumer_receipts" USING btree ("event_id","consumer_key");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_invitation_token_idx" ON "workspace_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_invitation_pending_email_idx" ON "workspace_invitations" USING btree ("workspace_id","email") WHERE "workspace_invitations"."accepted_at" IS NULL AND "workspace_invitations"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "audit_logs_workspace_created_idx" ON "audit_logs" USING btree ("workspace_id","created_at","id");--> statement-breakpoint
-- Preserve historical attempt rows under unique provenance keys. No new live consumer owns these legacy jobs.
UPDATE "event_dispatch_attempts" SET "consumer_key" = 'legacy:' || "id";--> statement-breakpoint
CREATE UNIQUE INDEX "event_dispatch_event_consumer_unique" ON "event_dispatch_attempts" USING btree ("event_id","consumer_key");--> statement-breakpoint
CREATE INDEX "events_aggregate_revision_fact_idx" ON "events" USING btree ("workspace_id","aggregate_type","aggregate_id","aggregate_version","event_type");--> statement-breakpoint
UPDATE "event_dispatch_attempts" SET "status" = 'FAILED', "locked_at" = NULL, "locked_by" = NULL WHERE "status" = 'PROCESSING';--> statement-breakpoint
UPDATE "event_dispatch_attempts" SET "locked_at" = NULL, "locked_by" = NULL WHERE "status" <> 'PROCESSING';--> statement-breakpoint
ALTER TABLE "event_dispatch_attempts" ADD CONSTRAINT "event_dispatch_attempts_lease_check" CHECK (("event_dispatch_attempts"."status" = 'PROCESSING' and "event_dispatch_attempts"."locked_at" is not null and "event_dispatch_attempts"."locked_by" is not null) or ("event_dispatch_attempts"."status" <> 'PROCESSING' and "event_dispatch_attempts"."locked_at" is null and "event_dispatch_attempts"."locked_by" is null));--> statement-breakpoint
ALTER TABLE "event_dispatch_attempts" ADD CONSTRAINT "event_dispatch_attempt_count_check" CHECK ("event_dispatch_attempts"."attempt_count" >= 0);--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_version_positive" CHECK ("events"."schema_version" is null or "events"."schema_version" > 0);--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspace_lifecycle_exclusive" CHECK ("workspaces"."archived_at" IS NULL OR "workspaces"."deleted_at" IS NULL);