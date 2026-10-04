CREATE UNIQUE INDEX m13_events_tenant_identity_idx ON events(workspace_id,id);--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('IN_APP', 'EMAIL');--> statement-breakpoint
CREATE TYPE "public"."notification_delivery_status" AS ENUM('PENDING', 'PROCESSING', 'SENDING', 'FAILED', 'SUCCEEDED', 'UNKNOWN', 'SUPPRESSED', 'DEAD');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('ASSIGNMENT', 'MENTION', 'SUBSCRIPTION', 'PLANNING_UPDATE');--> statement-breakpoint
CREATE TABLE "notification_delivery_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"notification_id" text NOT NULL,
	"recipient_id" text NOT NULL,
	"channel" "notification_channel" DEFAULT 'EMAIL' NOT NULL,
	"status" "notification_delivery_status" DEFAULT 'PENDING' NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"locked_by" text,
	"lease_token" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"message_id" text NOT NULL,
	"provider_receipt" text,
	"last_error_code" text,
	"completed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "m13_delivery_email_channel" CHECK ("notification_delivery_jobs"."channel"='EMAIL'),
	CONSTRAINT "m13_delivery_attempt_count" CHECK ("notification_delivery_jobs"."attempt_count">=0),
	CONSTRAINT "m13_delivery_lease" CHECK (("notification_delivery_jobs"."status" IN ('PROCESSING','SENDING')) = ("notification_delivery_jobs"."lease_until" IS NOT NULL AND "notification_delivery_jobs"."locked_by" IS NOT NULL AND "notification_delivery_jobs"."lease_token" IS NOT NULL)),
	CONSTRAINT "m13_delivery_sent" CHECK (("notification_delivery_jobs"."status"='SUCCEEDED') = ("notification_delivery_jobs"."sent_at" IS NOT NULL)),
	CONSTRAINT "m13_delivery_error_code" CHECK ("notification_delivery_jobs"."last_error_code" IS NULL OR "notification_delivery_jobs"."last_error_code" ~ '^[A-Z0-9_]{1,100}$')
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"recipient_id" text NOT NULL,
	"in_app_enabled" boolean DEFAULT true NOT NULL,
	"email_enabled" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "m13_notification_preferences_revision" CHECK ("notification_preferences"."revision">=1)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"recipient_id" text NOT NULL,
	"actor_id" text,
	"event_id" text NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"issue_id" text,
	"project_id" text,
	"initiative_id" text,
	"document_id" text,
	"title" text,
	"body" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"read_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"snoozed_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "m13_notification_target" CHECK (num_nonnulls("notifications"."issue_id","notifications"."project_id","notifications"."initiative_id","notifications"."document_id")<=1),
	CONSTRAINT "m13_notification_title" CHECK ("notifications"."title" IS NULL OR length("notifications"."title") <= 500),
	CONSTRAINT "m13_notification_body" CHECK ("notifications"."body" IS NULL OR length("notifications"."body") <= 10000),
	CONSTRAINT "m13_notification_revision" CHECK ("notifications"."revision">=1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "notification_delivery_notification_channel_idx" ON "notification_delivery_jobs" USING btree ("notification_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_delivery_message_id_idx" ON "notification_delivery_jobs" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "notification_delivery_due_idx" ON "notification_delivery_jobs" USING btree ("status","run_after","lease_until");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_member_idx" ON "notification_preferences" USING btree ("workspace_id","recipient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_workspace_identity_idx" ON "notifications" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_delivery_identity_idx" ON "notifications" USING btree ("workspace_id","id","recipient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_event_recipient_kind_idx" ON "notifications" USING btree ("event_id","recipient_id","kind");--> statement-breakpoint
CREATE INDEX "notifications_inbox_idx" ON "notifications" USING btree ("workspace_id","recipient_id","created_at","id");--> statement-breakpoint
ALTER TABLE "notification_delivery_jobs" ADD CONSTRAINT "notification_delivery_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_delivery_jobs" ADD CONSTRAINT "notification_delivery_notification_tenant_fk" FOREIGN KEY ("workspace_id","notification_id","recipient_id") REFERENCES "public"."notifications"("workspace_id","id","recipient_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_member_tenant_fk" FOREIGN KEY ("workspace_id","recipient_id") REFERENCES "public"."memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_tenant_fk" FOREIGN KEY ("workspace_id","recipient_id") REFERENCES "public"."memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_tenant_fk" FOREIGN KEY ("workspace_id","actor_id") REFERENCES "public"."memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_tenant_fk" FOREIGN KEY ("workspace_id","event_id") REFERENCES "public"."events"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_issue_tenant_fk" FOREIGN KEY ("workspace_id","issue_id") REFERENCES "public"."issues"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_tenant_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_initiative_tenant_fk" FOREIGN KEY ("workspace_id","initiative_id") REFERENCES "public"."initiatives"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_document_tenant_fk" FOREIGN KEY ("workspace_id","document_id") REFERENCES "public"."documents"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION guard_notification_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Notification history is retained' USING ERRCODE='23514',CONSTRAINT='m13_notification_retention'; END IF;
  IF NEW.id<>OLD.id OR NEW.workspace_id<>OLD.workspace_id OR NEW.recipient_id<>OLD.recipient_id OR NEW.actor_id IS DISTINCT FROM OLD.actor_id OR NEW.event_id<>OLD.event_id OR NEW.kind<>OLD.kind OR NEW.issue_id IS DISTINCT FROM OLD.issue_id OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.initiative_id IS DISTINCT FROM OLD.initiative_id OR NEW.document_id IS DISTINCT FROM OLD.document_id OR NEW.title IS DISTINCT FROM OLD.title OR NEW.body IS DISTINCT FROM OLD.body THEN RAISE EXCEPTION 'Notification attribution and targets are immutable' USING ERRCODE='23514',CONSTRAINT='m13_notification_identity'; END IF;
  IF NEW.revision=OLD.revision THEN NEW.revision:=OLD.revision+1; ELSIF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Revision must advance by one' USING ERRCODE='23514',CONSTRAINT='m13_revision_monotonic'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER m13_notification_guard BEFORE UPDATE OR DELETE ON notifications FOR EACH ROW EXECUTE FUNCTION guard_notification_identity();
--> statement-breakpoint
CREATE FUNCTION guard_notification_preferences() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Notification preferences are retained' USING ERRCODE='23514',CONSTRAINT='m13_preferences_retention'; END IF;
  IF NEW.id<>OLD.id OR NEW.workspace_id<>OLD.workspace_id OR NEW.recipient_id<>OLD.recipient_id THEN RAISE EXCEPTION 'Preference owner is immutable' USING ERRCODE='23514',CONSTRAINT='m13_preferences_identity'; END IF;
  IF NEW.revision=OLD.revision THEN NEW.revision:=OLD.revision+1; ELSIF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Revision must advance by one' USING ERRCODE='23514',CONSTRAINT='m13_revision_monotonic'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER m13_preferences_guard BEFORE UPDATE OR DELETE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION guard_notification_preferences();
--> statement-breakpoint
CREATE FUNCTION guard_notification_delivery() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Delivery history is retained' USING ERRCODE='23514',CONSTRAINT='m13_delivery_retention'; END IF;
  IF NEW.id<>OLD.id OR NEW.workspace_id<>OLD.workspace_id OR NEW.notification_id<>OLD.notification_id OR NEW.recipient_id<>OLD.recipient_id OR NEW.channel<>OLD.channel OR NEW.message_id<>OLD.message_id THEN RAISE EXCEPTION 'Delivery identity is immutable' USING ERRCODE='23514',CONSTRAINT='m13_delivery_identity'; END IF;
  IF NEW.attempt_count<OLD.attempt_count THEN RAISE EXCEPTION 'Delivery attempts cannot decrease' USING ERRCODE='23514',CONSTRAINT='m13_delivery_attempt_monotonic'; END IF;
  IF OLD.status IN ('SUCCEEDED','SUPPRESSED') AND NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'Completed delivery cannot be reopened' USING ERRCODE='23514',CONSTRAINT='m13_delivery_terminal'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER m13_delivery_guard BEFORE UPDATE OR DELETE ON notification_delivery_jobs FOR EACH ROW EXECUTE FUNCTION guard_notification_delivery();
