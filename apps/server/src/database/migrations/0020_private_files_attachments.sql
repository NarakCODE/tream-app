CREATE TYPE "public"."file_status" AS ENUM('PENDING', 'UPLOADED', 'QUARANTINED', 'READY', 'DELETED', 'PURGING', 'PURGED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."storage_cleanup_reason" AS ENUM('ABANDONED', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."storage_cleanup_status" AS ENUM('PENDING', 'PROCESSING', 'FAILED', 'SUCCEEDED', 'CANCELED');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"file_id" text NOT NULL,
	"issue_id" text,
	"project_id" text,
	"comment_id" text,
	"created_by_id" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "m10_attachment_target" CHECK (num_nonnulls("attachments"."issue_id","attachments"."project_id","attachments"."comment_id") = 1),
	CONSTRAINT "m10_attachment_revision" CHECK ("attachments"."revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"created_by_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"name" text NOT NULL,
	"declared_mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"actual_size_bytes" bigint,
	"actual_mime_type" text,
	"actual_sha256" text,
	"status" "file_status" DEFAULT 'PENDING' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"upload_expires_at" timestamp with time zone NOT NULL,
	"uploaded_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"quarantined_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"purge_after" timestamp with time zone,
	"purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "m10_file_storage_key" CHECK ("files"."storage_key" ~ '^[A-Za-z0-9_-]{1,128}$'),
	CONSTRAINT "m10_file_name" CHECK (trim("files"."name") <> '' AND length("files"."name") <= 255 AND "files"."name" !~ '[[:cntrl:]/]' AND position(chr(92) in "files"."name") = 0),
	CONSTRAINT "m10_file_size" CHECK ("files"."size_bytes" > 0 AND ("files"."actual_size_bytes" IS NULL OR "files"."actual_size_bytes" >= 0)),
	CONSTRAINT "m10_file_checksum" CHECK ("files"."sha256" ~ '^[a-f0-9]{64}$' AND ("files"."actual_sha256" IS NULL OR "files"."actual_sha256" ~ '^[a-f0-9]{64}$')),
	CONSTRAINT "m10_file_revision" CHECK ("files"."revision" >= 1),
	CONSTRAINT "m10_file_ready_metadata" CHECK ("files"."status" <> 'READY' OR ("files"."uploaded_at" IS NOT NULL AND "files"."ready_at" IS NOT NULL AND "files"."deleted_at" IS NULL AND "files"."actual_size_bytes" IS NOT NULL AND "files"."actual_size_bytes" = "files"."size_bytes" AND "files"."actual_sha256" IS NOT NULL AND "files"."actual_sha256" = "files"."sha256" AND "files"."actual_mime_type" IS NOT NULL AND "files"."actual_mime_type" = "files"."declared_mime_type")),
	CONSTRAINT "m10_file_lifecycle_timestamps" CHECK (("files"."status" <> 'UPLOADED' OR "files"."uploaded_at" IS NOT NULL) AND ("files"."status" <> 'QUARANTINED' OR "files"."quarantined_at" IS NOT NULL) AND ("files"."status" <> 'DELETED' OR "files"."deleted_at" IS NOT NULL) AND ("files"."status" <> 'PURGED' OR "files"."purged_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "storage_cleanup_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"file_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"reason" "storage_cleanup_reason" NOT NULL,
	"status" "storage_cleanup_status" DEFAULT 'PENDING' NOT NULL,
	"run_after" timestamp with time zone NOT NULL,
	"locked_until" timestamp with time zone,
	"locked_by" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "m10_cleanup_attempt_count" CHECK ("storage_cleanup_jobs"."attempt_count" >= 0),
	CONSTRAINT "m10_cleanup_lease" CHECK ("storage_cleanup_jobs"."status" <> 'PROCESSING' OR ("storage_cleanup_jobs"."locked_until" IS NOT NULL AND "storage_cleanup_jobs"."locked_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_workspace_identity_idx" ON "attachments" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_issue_active_idx" ON "attachments" USING btree ("file_id","issue_id") WHERE "attachments"."deleted_at" IS NULL AND "attachments"."issue_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_project_active_idx" ON "attachments" USING btree ("file_id","project_id") WHERE "attachments"."deleted_at" IS NULL AND "attachments"."project_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_comment_active_idx" ON "attachments" USING btree ("file_id","comment_id") WHERE "attachments"."deleted_at" IS NULL AND "attachments"."comment_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "attachments_workspace_history_idx" ON "attachments" USING btree ("workspace_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "files_workspace_identity_idx" ON "files" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "files_storage_key_permanent_idx" ON "files" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "files_workspace_history_idx" ON "files" USING btree ("workspace_id","created_at","id");--> statement-breakpoint
CREATE INDEX "files_abandoned_idx" ON "files" USING btree ("upload_expires_at") WHERE "files"."status" IN ('PENDING','UPLOADED','QUARANTINED');--> statement-breakpoint
CREATE UNIQUE INDEX "storage_cleanup_active_file_idx" ON "storage_cleanup_jobs" USING btree ("file_id") WHERE "storage_cleanup_jobs"."status" IN ('PENDING','PROCESSING','FAILED');--> statement-breakpoint
CREATE INDEX "storage_cleanup_due_idx" ON "storage_cleanup_jobs" USING btree ("status","run_after","locked_until");--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_file_tenant_fk" FOREIGN KEY ("workspace_id","file_id") REFERENCES "public"."files"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_issue_tenant_fk" FOREIGN KEY ("workspace_id","issue_id") REFERENCES "public"."issues"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_project_tenant_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_comment_tenant_fk" FOREIGN KEY ("workspace_id","comment_id") REFERENCES "public"."comments"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_author_tenant_fk" FOREIGN KEY ("workspace_id","created_by_id") REFERENCES "public"."memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploader_tenant_fk" FOREIGN KEY ("workspace_id","created_by_id") REFERENCES "public"."memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_cleanup_jobs" ADD CONSTRAINT "storage_cleanup_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_cleanup_jobs" ADD CONSTRAINT "storage_cleanup_file_tenant_fk" FOREIGN KEY ("workspace_id","file_id") REFERENCES "public"."files"("workspace_id","id") ON DELETE no action ON UPDATE no action;