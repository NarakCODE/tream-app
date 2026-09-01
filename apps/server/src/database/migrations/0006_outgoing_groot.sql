CREATE TYPE "public"."issue_status_category" AS ENUM('BACKLOG', 'UNSTARTED', 'STARTED', 'COMPLETED', 'CANCELED', 'DUPLICATE');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('PLANNED', 'STARTED', 'PAUSED', 'COMPLETED', 'CANCELED');--> statement-breakpoint
CREATE TYPE "public"."work_priority" AS ENUM('NO_PRIORITY', 'LOW', 'MEDIUM', 'HIGH', 'URGENT');--> statement-breakpoint
CREATE TABLE "cycles" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"number" integer NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cycles_ends_after_starts_check" CHECK ("cycles"."ends_at" > "cycles"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "issue_statuses" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"name" text NOT NULL,
	"category" "issue_status_category" NOT NULL,
	"position" integer NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"team_id" text NOT NULL,
	"number" integer NOT NULL,
	"identifier" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status_id" text NOT NULL,
	"priority" "work_priority" DEFAULT 'NO_PRIORITY' NOT NULL,
	"assignee_id" text,
	"project_id" text,
	"cycle_id" text,
	"due_date" timestamp with time zone,
	"estimate" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "issues_number_check" CHECK ("issues"."number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "project_teams" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"team_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"summary" text,
	"description" text,
	"status" "project_status" DEFAULT 'PLANNED' NOT NULL,
	"priority" "work_priority" DEFAULT 'NO_PRIORITY' NOT NULL,
	"lead_id" text,
	"start_date" timestamp with time zone,
	"target_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "projects_target_date_check" CHECK ("projects"."start_date" is null or "projects"."target_date" is null or "projects"."target_date" >= "projects"."start_date")
);
--> statement-breakpoint
CREATE TABLE "team_memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"membership_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"description" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"cycle_duration_weeks" integer DEFAULT 2 NOT NULL,
	"cycle_start_day" integer DEFAULT 1 NOT NULL,
	"cycle_cooldown_days" integer DEFAULT 0 NOT NULL,
	"upcoming_cycles_count" integer DEFAULT 3 NOT NULL,
	"cycles_enabled" boolean DEFAULT false NOT NULL,
	"next_issue_number" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	CONSTRAINT "teams_next_issue_number_check" CHECK ("teams"."next_issue_number" >= 1)
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_event_type_check";--> statement-breakpoint
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_statuses" ADD CONSTRAINT "issue_statuses_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_status_id_issue_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."issue_statuses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_assignee_id_memberships_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_teams" ADD CONSTRAINT "project_teams_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_teams" ADD CONSTRAINT "project_teams_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_lead_id_memberships_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cycles_team_number_idx" ON "cycles" USING btree ("team_id","number");--> statement-breakpoint
CREATE INDEX "cycles_team_starts_at_idx" ON "cycles" USING btree ("team_id","starts_at");--> statement-breakpoint
CREATE INDEX "cycles_team_completed_at_idx" ON "cycles" USING btree ("team_id","completed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_statuses_team_name_idx" ON "issue_statuses" USING btree ("team_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_statuses_team_position_idx" ON "issue_statuses" USING btree ("team_id","position");--> statement-breakpoint
CREATE INDEX "issue_statuses_team_id_idx" ON "issue_statuses" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issues_team_number_idx" ON "issues" USING btree ("team_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "issues_workspace_identifier_idx" ON "issues" USING btree ("workspace_id","identifier");--> statement-breakpoint
CREATE INDEX "issues_workspace_created_active_idx" ON "issues" USING btree ("workspace_id","created_at","id") WHERE "issues"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "issues_team_created_active_idx" ON "issues" USING btree ("team_id","created_at","id") WHERE "issues"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "issues_workspace_team_active_idx" ON "issues" USING btree ("workspace_id","team_id") WHERE "issues"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "issues_project_active_idx" ON "issues" USING btree ("project_id") WHERE "issues"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "issues_cycle_active_idx" ON "issues" USING btree ("cycle_id") WHERE "issues"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "issues_assignee_active_idx" ON "issues" USING btree ("assignee_id") WHERE "issues"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "issues_status_active_idx" ON "issues" USING btree ("status_id") WHERE "issues"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "project_teams_project_team_idx" ON "project_teams" USING btree ("project_id","team_id");--> statement-breakpoint
CREATE INDEX "project_teams_project_id_idx" ON "project_teams" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_teams_team_id_idx" ON "project_teams" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "projects_workspace_created_active_idx" ON "projects" USING btree ("workspace_id","created_at","id") WHERE "projects"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "projects_workspace_status_active_idx" ON "projects" USING btree ("workspace_id","status","created_at","id") WHERE "projects"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "projects_workspace_lead_active_idx" ON "projects" USING btree ("workspace_id","lead_id","created_at","id") WHERE "projects"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "team_memberships_team_membership_idx" ON "team_memberships" USING btree ("team_id","membership_id");--> statement-breakpoint
CREATE INDEX "team_memberships_team_id_idx" ON "team_memberships" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_memberships_membership_id_idx" ON "team_memberships" USING btree ("membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_workspace_key_active_idx" ON "teams" USING btree ("workspace_id","key") WHERE "teams"."retired_at" is null;--> statement-breakpoint
CREATE INDEX "teams_workspace_created_idx" ON "teams" USING btree ("workspace_id","created_at","id");--> statement-breakpoint
CREATE INDEX "teams_workspace_retired_idx" ON "teams" USING btree ("workspace_id","retired_at");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_event_type_check" CHECK ("events"."event_type" in ('workspace.created', 'database.record.created', 'database.record.updated', 'database.record.deleted', 'contact.created', 'contact.updated', 'deal.created', 'deal.stage_changed', 'task.created', 'task.completed', 'email.received', 'email.sent', 'agent.run.completed', 'agent.run.failed', 'team.created', 'team.updated', 'team.retired', 'project.created', 'project.updated', 'project.completed', 'project.canceled', 'issue.created', 'issue.updated', 'issue.assigned', 'issue.status_changed', 'issue.deleted', 'cycle.created', 'cycle.started', 'cycle.completed'));