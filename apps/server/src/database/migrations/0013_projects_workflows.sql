CREATE TYPE "public"."update_health" AS ENUM('ON_TRACK', 'AT_RISK', 'OFF_TRACK');--> statement-breakpoint
CREATE TABLE "project_members" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text NOT NULL,
	"membership_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_milestones" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"target_date" date,
	"position" integer NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_milestones_position_check" CHECK ("project_milestones"."position" >= 0),
	CONSTRAINT "project_milestones_name_check" CHECK (trim("project_milestones"."name") <> '')
);
--> statement-breakpoint
CREATE TABLE "project_statuses" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"category" "project_status" NOT NULL,
	"color" text,
	"position" integer NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_statuses_position_check" CHECK ("project_statuses"."position" >= 0),
	CONSTRAINT "project_statuses_name_check" CHECK (trim("project_statuses"."name") <> ''),
	CONSTRAINT "project_statuses_default_usable_check" CHECK (NOT "project_statuses"."is_default" OR ("project_statuses"."archived_at" IS NULL AND "project_statuses"."category" = 'PLANNED'))
);
--> statement-breakpoint
CREATE TABLE "project_updates" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"health" "update_health" NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_updates_body_check" CHECK (trim("project_updates"."body") <> '')
);
--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "milestone_id" text;--> statement-breakpoint
ALTER TABLE "project_teams" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "status_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "created_by_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
-- Preserve legacy status categories and associations; never invent team access.
INSERT INTO project_statuses (id,workspace_id,name,category,position,is_default)
SELECT gen_random_uuid()::text,w.id,c.name,c.category::project_status,c.position,c.category='PLANNED'
FROM workspaces w CROSS JOIN (VALUES ('Planned','PLANNED',0),('Started','STARTED',1),('Paused','PAUSED',2),('Completed','COMPLETED',3),('Canceled','CANCELED',4)) c(name,category,position);
--> statement-breakpoint
UPDATE projects p SET status_id=s.id, completed_at=CASE WHEN p.status='COMPLETED' THEN p.updated_at ELSE NULL END
FROM project_statuses s WHERE s.workspace_id=p.workspace_id AND s.category=p.status;
--> statement-breakpoint
UPDATE project_teams pt SET workspace_id=p.workspace_id FROM projects p WHERE p.id=pt.project_id;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM projects p WHERE p.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM project_teams pt JOIN teams t ON t.id=pt.team_id AND t.workspace_id=p.workspace_id AND t.retired_at IS NULL WHERE pt.project_id=p.id)) THEN
    RAISE EXCEPTION 'M06 migration requires an explicitly assigned active team for every undeleted legacy project' USING ERRCODE='23514',CONSTRAINT='m06_legacy_project_team';
  END IF;
  IF EXISTS (SELECT 1 FROM projects p JOIN issues i ON i.project_id=p.id JOIN issue_statuses ist ON ist.id=i.status_id WHERE i.deleted_at IS NULL AND ist.category NOT IN ('COMPLETED','CANCELED','DUPLICATE') AND (p.deleted_at IS NOT NULL OR p.status IN ('COMPLETED','CANCELED'))) THEN
    RAISE EXCEPTION 'M06 migration requires explicitly resolving unfinished work in legacy closed projects' USING ERRCODE='23514',CONSTRAINT='m06_legacy_project_work';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE project_teams ALTER COLUMN workspace_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE projects ALTER COLUMN status_id SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "project_members_project_membership_idx" ON "project_members" USING btree ("project_id","membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_milestones_tenant_identity_idx" ON "project_milestones" USING btree ("workspace_id","project_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_milestones_position_idx" ON "project_milestones" USING btree ("project_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "project_statuses_workspace_identity_idx" ON "project_statuses" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_statuses_name_active_idx" ON "project_statuses" USING btree ("workspace_id",lower(trim("name"))) WHERE "project_statuses"."archived_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "project_statuses_position_active_idx" ON "project_statuses" USING btree ("workspace_id","position") WHERE "project_statuses"."archived_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "project_statuses_default_active_idx" ON "project_statuses" USING btree ("workspace_id") WHERE "project_statuses"."is_default" AND "project_statuses"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "project_updates_history_idx" ON "project_updates" USING btree ("project_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_teams_tenant_association_idx" ON "project_teams" USING btree ("workspace_id","project_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_workspace_identity_idx" ON "projects" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_milestone_requires_project" CHECK ("issues"."milestone_id" IS NULL OR "issues"."project_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_name_check" CHECK (trim("projects"."name") <> '');--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_lifecycle_exclusive" CHECK ("projects"."archived_at" IS NULL OR "projects"."deleted_at" IS NULL);--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_tenant_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_member_tenant_fk" FOREIGN KEY ("workspace_id","membership_id") REFERENCES "public"."memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_tenant_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_statuses" ADD CONSTRAINT "project_statuses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_updates" ADD CONSTRAINT "project_updates_project_tenant_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_updates" ADD CONSTRAINT "project_updates_author_tenant_fk" FOREIGN KEY ("workspace_id","author_id") REFERENCES "public"."memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_project_team_tenant_fk" FOREIGN KEY ("workspace_id","project_id","team_id") REFERENCES "public"."project_teams"("workspace_id","project_id","team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_milestone_project_fk" FOREIGN KEY ("workspace_id","project_id","milestone_id") REFERENCES "public"."project_milestones"("workspace_id","project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_teams" ADD CONSTRAINT "project_teams_project_tenant_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_teams" ADD CONSTRAINT "project_teams_team_tenant_fk" FOREIGN KEY ("workspace_id","team_id") REFERENCES "public"."teams"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_status_tenant_fk" FOREIGN KEY ("workspace_id","status_id") REFERENCES "public"."project_statuses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_creator_tenant_fk" FOREIGN KEY ("workspace_id","created_by_id") REFERENCES "public"."memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_lead_tenant_fk" FOREIGN KEY ("workspace_id","lead_id") REFERENCES "public"."memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;