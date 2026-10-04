CREATE TYPE "public"."view_resource" AS ENUM('ISSUES', 'PROJECTS');--> statement-breakpoint
CREATE TYPE "public"."view_visibility" AS ENUM('PRIVATE', 'WORKSPACE');--> statement-breakpoint
CREATE TABLE "favorites" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"membership_id" text NOT NULL,
	"issue_id" text,
	"project_id" text,
	"team_id" text,
	"initiative_id" text,
	"view_id" text,
	"position" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "m12_favorite_target" CHECK (num_nonnulls("favorites"."issue_id","favorites"."project_id","favorites"."team_id","favorites"."initiative_id","favorites"."view_id")=1),
	CONSTRAINT "m12_favorite_position" CHECK ("favorites"."position">=0),
	CONSTRAINT "m12_favorite_revision" CHECK ("favorites"."revision">=1)
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"owner_id" text NOT NULL,
	"team_id" text,
	"project_id" text,
	"resource" "view_resource" NOT NULL,
	"visibility" "view_visibility" DEFAULT 'PRIVATE' NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"display" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "m12_view_name" CHECK (length(trim("saved_views"."name")) BETWEEN 1 AND 200),
	CONSTRAINT "m12_view_description" CHECK ("saved_views"."description" IS NULL OR length("saved_views"."description") <= 10000),
	CONSTRAINT "m12_view_filters" CHECK (jsonb_typeof("saved_views"."filters")='object' AND octet_length("saved_views"."filters"::text) <= 32768),
	CONSTRAINT "m12_view_display" CHECK (jsonb_typeof("saved_views"."display")='object' AND octet_length("saved_views"."display"::text) <= 16384),
	CONSTRAINT "m12_view_revision" CHECK ("saved_views"."revision">=1),
	CONSTRAINT "m12_view_lifecycle" CHECK ("saved_views"."archived_at" IS NULL OR "saved_views"."deleted_at" IS NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_workspace_identity_idx" ON "favorites" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_issue_idx" ON "favorites" USING btree ("membership_id","issue_id") WHERE "favorites"."issue_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_project_idx" ON "favorites" USING btree ("membership_id","project_id") WHERE "favorites"."project_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_team_idx" ON "favorites" USING btree ("membership_id","team_id") WHERE "favorites"."team_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_initiative_idx" ON "favorites" USING btree ("membership_id","initiative_id") WHERE "favorites"."initiative_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_view_idx" ON "favorites" USING btree ("membership_id","view_id") WHERE "favorites"."view_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_views_workspace_identity_idx" ON "saved_views" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "saved_views_history_idx" ON "saved_views" USING btree ("workspace_id","created_at","id");--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_member_tenant_fk" FOREIGN KEY ("workspace_id","membership_id") REFERENCES "public"."memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_issue_tenant_fk" FOREIGN KEY ("workspace_id","issue_id") REFERENCES "public"."issues"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_project_tenant_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_team_tenant_fk" FOREIGN KEY ("workspace_id","team_id") REFERENCES "public"."teams"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_initiative_tenant_fk" FOREIGN KEY ("workspace_id","initiative_id") REFERENCES "public"."initiatives"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_view_tenant_fk" FOREIGN KEY ("workspace_id","view_id") REFERENCES "public"."saved_views"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_owner_tenant_fk" FOREIGN KEY ("workspace_id","owner_id") REFERENCES "public"."memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_team_tenant_fk" FOREIGN KEY ("workspace_id","team_id") REFERENCES "public"."teams"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_project_tenant_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE favorites ADD CONSTRAINT m12_favorites_member_position UNIQUE(membership_id,position) DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
CREATE FUNCTION guard_saved_view() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Saved view placeholders are retained' USING ERRCODE='23514',CONSTRAINT='m12_view_retention'; END IF;
  IF NEW.id<>OLD.id OR NEW.workspace_id<>OLD.workspace_id OR NEW.owner_id<>OLD.owner_id OR NEW.resource<>OLD.resource THEN RAISE EXCEPTION 'Saved view identity is immutable' USING ERRCODE='23514',CONSTRAINT='m12_view_identity'; END IF;
  IF NEW.revision=OLD.revision THEN NEW.revision:=OLD.revision+1; ELSIF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Revision must advance by one' USING ERRCODE='23514',CONSTRAINT='m12_revision_monotonic'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER m12_view_guard BEFORE UPDATE OR DELETE ON saved_views FOR EACH ROW EXECUTE FUNCTION guard_saved_view();
--> statement-breakpoint
CREATE FUNCTION guard_favorite_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id<>OLD.id OR NEW.workspace_id<>OLD.workspace_id OR NEW.membership_id<>OLD.membership_id OR NEW.issue_id IS DISTINCT FROM OLD.issue_id OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.initiative_id IS DISTINCT FROM OLD.initiative_id OR NEW.view_id IS DISTINCT FROM OLD.view_id THEN RAISE EXCEPTION 'Favorite identity is immutable' USING ERRCODE='23514',CONSTRAINT='m12_favorite_identity'; END IF;
  IF NEW.revision=OLD.revision THEN NEW.revision:=OLD.revision+1; ELSIF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Revision must advance by one' USING ERRCODE='23514',CONSTRAINT='m12_revision_monotonic'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER m12_favorite_guard BEFORE UPDATE ON favorites FOR EACH ROW EXECUTE FUNCTION guard_favorite_identity();
