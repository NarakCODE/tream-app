CREATE TYPE "public"."issue_relation_type" AS ENUM('BLOCKS', 'RELATED', 'DUPLICATES');--> statement-breakpoint
CREATE TABLE "cycle_rollovers" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"team_id" text NOT NULL,
	"issue_id" text NOT NULL,
	"from_cycle_id" text NOT NULL,
	"to_cycle_id" text NOT NULL,
	"rolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "m08_rollover_distinct" CHECK ("cycle_rollovers"."from_cycle_id" <> "cycle_rollovers"."to_cycle_id")
);
--> statement-breakpoint
CREATE TABLE "issue_identifiers" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"issue_id" text NOT NULL,
	"identifier" text NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_relations" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"source_issue_id" text NOT NULL,
	"target_issue_id" text NOT NULL,
	"type" "issue_relation_type" NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "m07_relation_self" CHECK ("issue_relations"."source_issue_id" <> "issue_relations"."target_issue_id")
);
--> statement-breakpoint
CREATE TABLE "comment_reactions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"comment_id" text NOT NULL,
	"membership_id" text NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "m09_reaction_nonempty" CHECK (trim("comment_reactions"."emoji") <> '')
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"issue_id" text,
	"project_id" text,
	"project_update_id" text,
	"author_id" text NOT NULL,
	"parent_comment_id" text,
	"body" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "m09_comment_target" CHECK (num_nonnulls("comments"."issue_id","comments"."project_id","comments"."project_update_id") = 1),
	CONSTRAINT "m09_comment_body" CHECK (trim("comments"."body") <> ''),
	CONSTRAINT "m09_comment_revision" CHECK ("comments"."revision" >= 1),
	CONSTRAINT "m09_comment_parent_self" CHECK ("comments"."parent_comment_id" IS NULL OR "comments"."parent_comment_id" <> "comments"."id")
);
--> statement-breakpoint
CREATE TABLE "issue_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"issue_id" text NOT NULL,
	"actor_id" text,
	"event_id" text NOT NULL,
	"action" text NOT NULL,
	"changes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_labels" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"issue_id" text NOT NULL,
	"label_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_subscribers" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"issue_id" text NOT NULL,
	"membership_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"team_id" text,
	"name" text NOT NULL,
	"description" text,
	"title_template" text,
	"body_template" text,
	"defaults" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_id" text NOT NULL,
	"archived_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "m09_template_name" CHECK (trim("issue_templates"."name") <> ''),
	CONSTRAINT "m09_template_defaults" CHECK (jsonb_typeof("issue_templates"."defaults") = 'object')
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"team_id" text,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"description" text,
	"group_name" text,
	"archived_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "m09_label_name" CHECK (trim("labels"."name") <> '')
);
--> statement-breakpoint
CREATE TABLE "project_labels" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text NOT NULL,
	"label_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_subscribers" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text NOT NULL,
	"membership_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cycles" ADD COLUMN "workspace_id" text;
--> statement-breakpoint
UPDATE cycles c SET workspace_id=t.workspace_id FROM teams t WHERE t.id=c.team_id;
--> statement-breakpoint
ALTER TABLE cycles ALTER COLUMN workspace_id SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cycles" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "cycles" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cycles" ADD COLUMN "canceled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "created_by_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "cycle_rollovers_once_idx" ON "cycle_rollovers" USING btree ("issue_id","from_cycle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_identifiers_permanent_idx" ON "issue_identifiers" USING btree ("workspace_id","identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_identifiers_current_idx" ON "issue_identifiers" USING btree ("issue_id") WHERE "issue_identifiers"."is_current";--> statement-breakpoint
CREATE UNIQUE INDEX "issue_relations_pair_idx" ON "issue_relations" USING btree ("workspace_id","source_issue_id","target_issue_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "comment_reactions_unique_idx" ON "comment_reactions" USING btree ("comment_id","membership_id","emoji");--> statement-breakpoint
CREATE UNIQUE INDEX "comments_workspace_identity_idx" ON "comments" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_activity_event_idx" ON "issue_activity" USING btree ("issue_id","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_labels_unique_idx" ON "issue_labels" USING btree ("issue_id","label_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_subscribers_unique_idx" ON "issue_subscribers" USING btree ("issue_id","membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "labels_workspace_identity_idx" ON "labels" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "labels_workspace_name_active_idx" ON "labels" USING btree ("workspace_id",lower(trim("name"))) WHERE "labels"."team_id" IS NULL AND "labels"."archived_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "labels_team_name_active_idx" ON "labels" USING btree ("team_id",lower(trim("name"))) WHERE "labels"."team_id" IS NOT NULL AND "labels"."archived_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "project_labels_unique_idx" ON "project_labels" USING btree ("project_id","label_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_subscribers_unique_idx" ON "project_subscribers" USING btree ("project_id","membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cycles_workspace_identity_idx" ON "cycles" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "cycles_team_identity_idx" ON "cycles" USING btree ("team_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "issues_workspace_identity_idx" ON "issues" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "cycles" ADD CONSTRAINT "m08_cycle_revision" CHECK ("cycles"."revision" >= 1);--> statement-breakpoint
ALTER TABLE "cycles" ADD CONSTRAINT "m08_cycle_terminal_exclusive" CHECK ("cycles"."completed_at" IS NULL OR "cycles"."canceled_at" IS NULL);--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "m07_issue_revision" CHECK ("issues"."revision" >= 1);--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "m07_issue_lifecycle" CHECK ("issues"."archived_at" IS NULL OR "issues"."deleted_at" IS NULL);--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "m07_issue_parent_self" CHECK ("issues"."parent_id" IS NULL OR "issues"."parent_id" <> "issues"."id");--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "m07_issue_estimate" CHECK ("issues"."estimate" IS NULL OR "issues"."estimate" >= 0);--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "m07_issue_title" CHECK (trim("issues"."title") <> '');--> statement-breakpoint
ALTER TABLE "cycle_rollovers" ADD CONSTRAINT "cycle_rollovers_issue_fk" FOREIGN KEY ("workspace_id","issue_id") REFERENCES "public"."issues"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycle_rollovers" ADD CONSTRAINT "cycle_rollovers_from_fk" FOREIGN KEY ("team_id","from_cycle_id") REFERENCES "public"."cycles"("team_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycle_rollovers" ADD CONSTRAINT "cycle_rollovers_to_fk" FOREIGN KEY ("team_id","to_cycle_id") REFERENCES "public"."cycles"("team_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycle_rollovers" ADD CONSTRAINT "cycle_rollovers_team_fk" FOREIGN KEY ("workspace_id","team_id") REFERENCES "public"."teams"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_identifiers" ADD CONSTRAINT "issue_identifiers_issue_tenant_fk" FOREIGN KEY ("workspace_id","issue_id") REFERENCES "public"."issues"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_relations" ADD CONSTRAINT "issue_relations_source_fk" FOREIGN KEY ("workspace_id","source_issue_id") REFERENCES "public"."issues"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_relations" ADD CONSTRAINT "issue_relations_target_fk" FOREIGN KEY ("workspace_id","target_issue_id") REFERENCES "public"."issues"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_relations" ADD CONSTRAINT "issue_relations_author_fk" FOREIGN KEY ("workspace_id","created_by_id") REFERENCES "public"."memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_comment_fk" FOREIGN KEY ("workspace_id","comment_id") REFERENCES "public"."comments"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_member_fk" FOREIGN KEY ("workspace_id","membership_id") REFERENCES "public"."memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_project_update_id_project_updates_id_fk" FOREIGN KEY ("project_update_id") REFERENCES "public"."project_updates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_comment_id_comments_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."comments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_issue_fk" FOREIGN KEY ("workspace_id","issue_id") REFERENCES "public"."issues"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_fk" FOREIGN KEY ("workspace_id","author_id") REFERENCES "public"."memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_fk" FOREIGN KEY ("workspace_id","parent_comment_id") REFERENCES "public"."comments"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_activity" ADD CONSTRAINT "issue_activity_issue_fk" FOREIGN KEY ("workspace_id","issue_id") REFERENCES "public"."issues"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_activity" ADD CONSTRAINT "issue_activity_actor_fk" FOREIGN KEY ("workspace_id","actor_id") REFERENCES "public"."memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_labels" ADD CONSTRAINT "issue_labels_target_fk" FOREIGN KEY ("workspace_id","issue_id") REFERENCES "public"."issues"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_labels" ADD CONSTRAINT "issue_labels_link_fk" FOREIGN KEY ("workspace_id","label_id") REFERENCES "public"."labels"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_subscribers" ADD CONSTRAINT "issue_subscribers_target_fk" FOREIGN KEY ("workspace_id","issue_id") REFERENCES "public"."issues"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_subscribers" ADD CONSTRAINT "issue_subscribers_link_fk" FOREIGN KEY ("workspace_id","membership_id") REFERENCES "public"."memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_templates" ADD CONSTRAINT "issue_templates_team_fk" FOREIGN KEY ("workspace_id","team_id") REFERENCES "public"."teams"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_templates" ADD CONSTRAINT "issue_templates_author_fk" FOREIGN KEY ("workspace_id","created_by_id") REFERENCES "public"."memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_team_fk" FOREIGN KEY ("workspace_id","team_id") REFERENCES "public"."teams"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_labels" ADD CONSTRAINT "project_labels_target_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_labels" ADD CONSTRAINT "project_labels_link_fk" FOREIGN KEY ("workspace_id","label_id") REFERENCES "public"."labels"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_subscribers" ADD CONSTRAINT "project_subscribers_target_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_subscribers" ADD CONSTRAINT "project_subscribers_link_fk" FOREIGN KEY ("workspace_id","membership_id") REFERENCES "public"."memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_team_tenant_fk" FOREIGN KEY ("workspace_id","team_id") REFERENCES "public"."teams"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_parent_id_issues_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_assignee_tenant_fk" FOREIGN KEY ("workspace_id","assignee_id") REFERENCES "public"."memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_creator_tenant_fk" FOREIGN KEY ("workspace_id","created_by_id") REFERENCES "public"."memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_cycle_team_fk" FOREIGN KEY ("team_id","cycle_id") REFERENCES "public"."cycles"("team_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_parent_tenant_fk" FOREIGN KEY ("workspace_id","parent_id") REFERENCES "public"."issues"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Reject inconsistent legacy identities rather than silently replacing URLs.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM issues i JOIN teams t ON t.id=i.team_id WHERE i.identifier<>t.key||'-'||i.number::text) THEN
  RAISE EXCEPTION 'Legacy issue identifiers must match their allocated team numbers' USING ERRCODE='23514',CONSTRAINT='m07_legacy_identifier';
 END IF;
END $$;
--> statement-breakpoint
UPDATE teams t SET next_issue_number=GREATEST(t.next_issue_number,COALESCE((SELECT max(i.number)+1 FROM issues i WHERE i.team_id=t.id),1));
--> statement-breakpoint
INSERT INTO issue_identifiers(id,workspace_id,issue_id,identifier,is_current,created_at,updated_at) SELECT gen_random_uuid()::text,workspace_id,id,identifier,true,created_at,updated_at FROM issues;
