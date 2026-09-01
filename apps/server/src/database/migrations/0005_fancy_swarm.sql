CREATE TYPE "public"."dynamic_field_type" AS ENUM('TEXT', 'LONG_TEXT', 'NUMBER', 'CURRENCY', 'BOOLEAN', 'DATE', 'DATETIME', 'EMAIL', 'PHONE', 'URL', 'SELECT', 'MULTI_SELECT', 'STATUS', 'USER', 'RELATION', 'CREATED_AT', 'UPDATED_AT');--> statement-breakpoint
CREATE TYPE "public"."event_dispatch_status" AS ENUM('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."idempotency_status" AS ENUM('PENDING', 'COMPLETED');--> statement-breakpoint
CREATE TABLE "dynamic_databases" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dynamic_fields" (
	"id" text PRIMARY KEY NOT NULL,
	"database_id" text NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"type" "dynamic_field_type" NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dynamic_records" (
	"id" text PRIMARY KEY NOT NULL,
	"database_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "event_dispatch_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"status" "event_dispatch_status" DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"completed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_event_type_check" CHECK ("events"."event_type" in ('workspace.created', 'database.record.created', 'database.record.updated', 'database.record.deleted', 'contact.created', 'contact.updated', 'deal.created', 'deal.stage_changed', 'task.created', 'task.completed', 'email.received', 'email.sent', 'agent.run.completed', 'agent.run.failed'))
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"method" text NOT NULL,
	"route" text NOT NULL,
	"key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"status" "idempotency_status" DEFAULT 'PENDING' NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"response_headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dynamic_databases" ADD CONSTRAINT "dynamic_databases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dynamic_fields" ADD CONSTRAINT "dynamic_fields_database_id_dynamic_databases_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."dynamic_databases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dynamic_databases_workspace_id_unique_idx" ON "dynamic_databases" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "dynamic_records" ADD CONSTRAINT "dynamic_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dynamic_records" ADD CONSTRAINT "dynamic_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dynamic_records" ADD CONSTRAINT "dynamic_records_workspace_database_fk" FOREIGN KEY ("workspace_id","database_id") REFERENCES "public"."dynamic_databases"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_dispatch_attempts" ADD CONSTRAINT "event_dispatch_attempts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dynamic_databases_workspace_created_idx" ON "dynamic_databases" USING btree ("workspace_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "dynamic_fields_database_key_active_idx" ON "dynamic_fields" USING btree ("database_id","key");--> statement-breakpoint
CREATE INDEX "dynamic_fields_database_created_idx" ON "dynamic_fields" USING btree ("database_id","created_at","id");--> statement-breakpoint
CREATE INDEX "dynamic_records_database_created_idx" ON "dynamic_records" USING btree ("database_id","created_at","id");--> statement-breakpoint
CREATE INDEX "dynamic_records_workspace_idx" ON "dynamic_records" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "event_dispatch_attempts_pending_idx" ON "event_dispatch_attempts" USING btree ("status","available_at","created_at","id") WHERE "event_dispatch_attempts"."status" in ('PENDING', 'FAILED');--> statement-breakpoint
CREATE INDEX "event_dispatch_attempts_event_created_idx" ON "event_dispatch_attempts" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "event_dispatch_attempts_processing_lock_idx" ON "event_dispatch_attempts" USING btree ("status","locked_at") WHERE "event_dispatch_attempts"."status" = 'PROCESSING';--> statement-breakpoint
CREATE INDEX "events_workspace_type_created_id_idx" ON "events" USING btree ("workspace_id","event_type","created_at","id");--> statement-breakpoint
CREATE INDEX "events_workspace_created_id_idx" ON "events" USING btree ("workspace_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_workspace_idempotency_key_idx" ON "events" USING btree ("workspace_id","idempotency_key") WHERE "events"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_user_method_route_key_unique_idx" ON "idempotency_keys" USING btree ("user_id","method","route","key");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys" USING btree ("expires_at");
