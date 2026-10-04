CREATE TYPE "public"."initiative_status" AS ENUM('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELED');--> statement-breakpoint
CREATE TABLE "initiative_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"initiative_id" text NOT NULL,
	"project_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "m11_initiative_project_position" CHECK ("initiative_projects"."position" >= 0),
	CONSTRAINT "m11_initiative_project_revision" CHECK ("initiative_projects"."revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "initiative_subscribers" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"initiative_id" text NOT NULL,
	"membership_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "initiative_updates" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"initiative_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"health" "update_health" NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "m11_initiative_update_body" CHECK (length(trim("initiative_updates"."body")) BETWEEN 1 AND 50000),
	CONSTRAINT "m11_initiative_update_revision" CHECK ("initiative_updates"."revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "initiatives" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "initiative_status" DEFAULT 'PLANNED' NOT NULL,
	"owner_id" text,
	"created_by_id" text NOT NULL,
	"target_date" date,
	"position" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "m11_initiative_name" CHECK (length(trim("initiatives"."name")) BETWEEN 1 AND 200),
	CONSTRAINT "m11_initiative_description" CHECK ("initiatives"."description" IS NULL OR length("initiatives"."description") <= 100000),
	CONSTRAINT "m11_initiative_revision" CHECK ("initiatives"."revision" >= 1),
	CONSTRAINT "m11_initiative_position" CHECK ("initiatives"."position" >= 0),
	CONSTRAINT "m11_initiative_lifecycle" CHECK ("initiatives"."archived_at" IS NULL OR "initiatives"."deleted_at" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"author_id" text NOT NULL,
	"project_id" text,
	"team_id" text,
	"initiative_id" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "m11_document_target" CHECK (num_nonnulls("documents"."project_id","documents"."team_id","documents"."initiative_id")=1),
	CONSTRAINT "m11_document_title" CHECK (length(trim("documents"."title")) BETWEEN 1 AND 200),
	CONSTRAINT "m11_document_body" CHECK (length("documents"."body") <= 200000),
	CONSTRAINT "m11_document_revision" CHECK ("documents"."revision">=1),
	CONSTRAINT "m11_document_lifecycle" CHECK ("documents"."archived_at" IS NULL OR "documents"."deleted_at" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "comments" DROP CONSTRAINT "m09_comment_target";--> statement-breakpoint
ALTER TABLE "attachments" DROP CONSTRAINT "m10_attachment_target";--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "initiative_id" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "initiative_update_id" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "mention_membership_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "document_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "initiative_projects_link_idx" ON "initiative_projects" USING btree ("initiative_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "initiative_projects_position_idx" ON "initiative_projects" USING btree ("initiative_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "initiative_subscribers_member_idx" ON "initiative_subscribers" USING btree ("initiative_id","membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "initiative_updates_workspace_identity_idx" ON "initiative_updates" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "initiative_updates_history_idx" ON "initiative_updates" USING btree ("initiative_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "initiatives_workspace_identity_idx" ON "initiatives" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "initiatives_history_idx" ON "initiatives" USING btree ("workspace_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_workspace_identity_idx" ON "documents" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "documents_history_idx" ON "documents" USING btree ("workspace_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_document_active_idx" ON "attachments" USING btree ("file_id","document_id") WHERE "attachments"."deleted_at" IS NULL AND "attachments"."document_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "m11_comment_mentions" CHECK (jsonb_typeof("comments"."mention_membership_ids")='array' AND jsonb_array_length("comments"."mention_membership_ids") <= 50 AND octet_length("comments"."mention_membership_ids"::text) <= 8192);--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "m09_comment_target" CHECK (num_nonnulls("comments"."issue_id","comments"."project_id","comments"."project_update_id","comments"."initiative_id","comments"."initiative_update_id") = 1);--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "m10_attachment_target" CHECK (num_nonnulls("attachments"."issue_id","attachments"."project_id","attachments"."comment_id","attachments"."document_id") = 1);--> statement-breakpoint
ALTER TABLE "initiative_projects" ADD CONSTRAINT "initiative_projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_projects" ADD CONSTRAINT "initiative_projects_initiative_tenant_fk" FOREIGN KEY ("workspace_id","initiative_id") REFERENCES "public"."initiatives"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_projects" ADD CONSTRAINT "initiative_projects_project_tenant_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_subscribers" ADD CONSTRAINT "initiative_subscribers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_subscribers" ADD CONSTRAINT "initiative_subscribers_initiative_tenant_fk" FOREIGN KEY ("workspace_id","initiative_id") REFERENCES "public"."initiatives"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_subscribers" ADD CONSTRAINT "initiative_subscribers_member_tenant_fk" FOREIGN KEY ("workspace_id","membership_id") REFERENCES "public"."memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_updates" ADD CONSTRAINT "initiative_updates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_updates" ADD CONSTRAINT "initiative_updates_initiative_tenant_fk" FOREIGN KEY ("workspace_id","initiative_id") REFERENCES "public"."initiatives"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_updates" ADD CONSTRAINT "initiative_updates_author_tenant_fk" FOREIGN KEY ("workspace_id","author_id") REFERENCES "public"."memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiatives" ADD CONSTRAINT "initiatives_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiatives" ADD CONSTRAINT "initiatives_owner_tenant_fk" FOREIGN KEY ("workspace_id","owner_id") REFERENCES "public"."memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiatives" ADD CONSTRAINT "initiatives_creator_tenant_fk" FOREIGN KEY ("workspace_id","created_by_id") REFERENCES "public"."memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_author_tenant_fk" FOREIGN KEY ("workspace_id","author_id") REFERENCES "public"."memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_tenant_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_team_tenant_fk" FOREIGN KEY ("workspace_id","team_id") REFERENCES "public"."teams"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_initiative_tenant_fk" FOREIGN KEY ("workspace_id","initiative_id") REFERENCES "public"."initiatives"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_initiative_update_tenant_fk" FOREIGN KEY ("workspace_id","initiative_update_id") REFERENCES "public"."initiative_updates"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_initiative_tenant_fk" FOREIGN KEY ("workspace_id","initiative_id") REFERENCES "public"."initiatives"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_document_tenant_fk" FOREIGN KEY ("workspace_id","document_id") REFERENCES "public"."documents"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_comment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent comments%ROWTYPE;
BEGIN
  PERFORM 1 FROM workspaces WHERE id=NEW.workspace_id FOR UPDATE;
  IF TG_OP='UPDATE' AND (NEW.workspace_id<>OLD.workspace_id OR NEW.author_id<>OLD.author_id OR NEW.issue_id IS DISTINCT FROM OLD.issue_id OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.project_update_id IS DISTINCT FROM OLD.project_update_id OR NEW.initiative_id IS DISTINCT FROM OLD.initiative_id OR NEW.initiative_update_id IS DISTINCT FROM OLD.initiative_update_id) THEN
    RAISE EXCEPTION 'Comment attribution and target are immutable' USING ERRCODE='23514',CONSTRAINT='m09_comment_identity';
  END IF;
  IF NEW.project_update_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM project_updates WHERE id=NEW.project_update_id AND workspace_id=NEW.workspace_id) THEN RAISE EXCEPTION 'Comment update must belong to the workspace' USING ERRCODE='23514',CONSTRAINT='m09_comment_update_target'; END IF;
  IF (TG_OP='INSERT' OR (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL)) AND NEW.initiative_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM initiatives WHERE id=NEW.initiative_id AND workspace_id=NEW.workspace_id AND archived_at IS NULL AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Initiative comment target is unavailable' USING ERRCODE='23514',CONSTRAINT='m11_comment_initiative_target'; END IF;
  IF (TG_OP='INSERT' OR (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL)) AND NEW.initiative_update_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM initiative_updates u JOIN initiatives i ON i.id=u.initiative_id WHERE u.id=NEW.initiative_update_id AND u.workspace_id=NEW.workspace_id AND u.deleted_at IS NULL AND i.archived_at IS NULL AND i.deleted_at IS NULL) THEN RAISE EXCEPTION 'Initiative update comment target is unavailable' USING ERRCODE='23514',CONSTRAINT='m11_comment_initiative_update_target'; END IF;
  IF jsonb_typeof(NEW.mention_membership_ids)<>'array' THEN RAISE EXCEPTION 'Mentions must be an array' USING ERRCODE='23514',CONSTRAINT='m11_comment_mentions'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.mention_membership_ids) v WHERE jsonb_typeof(v)<>'string') OR (SELECT count(*) FROM jsonb_array_elements_text(NEW.mention_membership_ids)) <> (SELECT count(DISTINCT v) FROM jsonb_array_elements_text(NEW.mention_membership_ids) v) THEN RAISE EXCEPTION 'Mentions must be unique membership identifiers' USING ERRCODE='23514',CONSTRAINT='m11_comment_mentions'; END IF;
  IF NEW.parent_comment_id IS NOT NULL THEN
    SELECT * INTO parent FROM comments WHERE id=NEW.parent_comment_id AND workspace_id=NEW.workspace_id;
    IF NOT FOUND OR parent.issue_id IS DISTINCT FROM NEW.issue_id OR parent.project_id IS DISTINCT FROM NEW.project_id OR parent.project_update_id IS DISTINCT FROM NEW.project_update_id OR parent.initiative_id IS DISTINCT FROM NEW.initiative_id OR parent.initiative_update_id IS DISTINCT FROM NEW.initiative_update_id OR (parent.deleted_at IS NOT NULL AND (TG_OP='INSERT' OR NEW.parent_comment_id IS DISTINCT FROM OLD.parent_comment_id)) THEN
      RAISE EXCEPTION 'Reply requires a usable comment on the same target' USING ERRCODE='23514',CONSTRAINT='m09_comment_parent_target';
    END IF;
    IF EXISTS(WITH RECURSIVE ancestors AS (SELECT id,parent_comment_id FROM comments WHERE id=NEW.parent_comment_id UNION SELECT c.id,c.parent_comment_id FROM comments c JOIN ancestors a ON c.id=a.parent_comment_id) SELECT 1 FROM ancestors WHERE id=NEW.id) THEN RAISE EXCEPTION 'Replies cannot contain cycles' USING ERRCODE='23514',CONSTRAINT='m09_comment_parent_cycle'; END IF;
  END IF;
  RETURN NEW;
END $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_private_attachment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE f files%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Attachment placeholders are retained' USING ERRCODE='23514',CONSTRAINT='m10_attachment_retention'; END IF;
  PERFORM 1 FROM workspaces WHERE id=NEW.workspace_id FOR UPDATE;
  IF TG_OP='UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.file_id IS DISTINCT FROM OLD.file_id OR NEW.created_by_id IS DISTINCT FROM OLD.created_by_id OR NEW.issue_id IS DISTINCT FROM OLD.issue_id OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.comment_id IS DISTINCT FROM OLD.comment_id OR NEW.document_id IS DISTINCT FROM OLD.document_id THEN RAISE EXCEPTION 'Attachment owner is immutable' USING ERRCODE='23514',CONSTRAINT='m10_attachment_identity'; END IF;
    IF NEW.revision=OLD.revision THEN NEW.revision:=OLD.revision+1;
    ELSIF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Attachment revision must advance by one' USING ERRCODE='23514',CONSTRAINT='m10_attachment_revision_monotonic'; END IF;
  END IF;
  IF TG_OP='INSERT' OR (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL) THEN
    SELECT * INTO f FROM files WHERE id=NEW.file_id AND workspace_id=NEW.workspace_id FOR UPDATE;
    IF NOT FOUND OR NOT (f.status='READY' OR (TG_OP='INSERT' AND f.status='PENDING' AND f.created_by_id=NEW.created_by_id AND f.upload_expires_at>now() AND NOT EXISTS(SELECT 1 FROM attachments WHERE file_id=f.id))) THEN RAISE EXCEPTION 'Attachment requires ready content or an initial upload intent' USING ERRCODE='23514',CONSTRAINT='m10_attachment_file_usable'; END IF;
    IF NEW.issue_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM issues WHERE id=NEW.issue_id AND workspace_id=NEW.workspace_id AND deleted_at IS NULL AND archived_at IS NULL) THEN RAISE EXCEPTION 'Attachment issue is not usable' USING ERRCODE='23514',CONSTRAINT='m10_attachment_target_usable'; END IF;
    IF NEW.project_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM projects WHERE id=NEW.project_id AND workspace_id=NEW.workspace_id AND deleted_at IS NULL AND archived_at IS NULL) THEN RAISE EXCEPTION 'Attachment project is not usable' USING ERRCODE='23514',CONSTRAINT='m10_attachment_target_usable'; END IF;
    IF NEW.document_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM documents WHERE id=NEW.document_id AND workspace_id=NEW.workspace_id AND deleted_at IS NULL AND archived_at IS NULL) THEN RAISE EXCEPTION 'Attachment document is not usable' USING ERRCODE='23514',CONSTRAINT='m11_attachment_document_target'; END IF;
    IF NEW.comment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM comments WHERE id=NEW.comment_id AND workspace_id=NEW.workspace_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Attachment comment is not usable' USING ERRCODE='23514',CONSTRAINT='m10_attachment_target_usable'; END IF;
  END IF;
  RETURN NEW;
END $$;

--> statement-breakpoint
CREATE FUNCTION guard_planning_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Planning resource history is retained' USING ERRCODE='23514',CONSTRAINT='m11_resource_retention'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR
     (TG_TABLE_NAME='initiatives' AND to_jsonb(NEW)->>'created_by_id' IS DISTINCT FROM to_jsonb(OLD)->>'created_by_id') OR
     (TG_TABLE_NAME IN ('documents','initiative_updates') AND to_jsonb(NEW)->>'author_id' IS DISTINCT FROM to_jsonb(OLD)->>'author_id') OR
     (TG_TABLE_NAME='documents' AND (to_jsonb(NEW)->>'project_id' IS DISTINCT FROM to_jsonb(OLD)->>'project_id' OR to_jsonb(NEW)->>'team_id' IS DISTINCT FROM to_jsonb(OLD)->>'team_id' OR to_jsonb(NEW)->>'initiative_id' IS DISTINCT FROM to_jsonb(OLD)->>'initiative_id')) OR
     (TG_TABLE_NAME='initiative_updates' AND to_jsonb(NEW)->>'initiative_id' IS DISTINCT FROM to_jsonb(OLD)->>'initiative_id') THEN
    RAISE EXCEPTION 'Planning resource attribution and scope are immutable' USING ERRCODE='23514',CONSTRAINT='m11_resource_identity';
  END IF;
  IF NEW.revision=OLD.revision THEN NEW.revision:=OLD.revision+1;
  ELSIF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Revision must advance by one' USING ERRCODE='23514',CONSTRAINT='m11_revision_monotonic'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER m11_initiative_guard BEFORE UPDATE OR DELETE ON initiatives FOR EACH ROW EXECUTE FUNCTION guard_planning_identity();
--> statement-breakpoint
CREATE TRIGGER m11_document_guard BEFORE UPDATE OR DELETE ON documents FOR EACH ROW EXECUTE FUNCTION guard_planning_identity();
--> statement-breakpoint
CREATE TRIGGER m11_initiative_update_guard BEFORE UPDATE OR DELETE ON initiative_updates FOR EACH ROW EXECUTE FUNCTION guard_planning_identity();
--> statement-breakpoint
CREATE FUNCTION guard_document_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM workspaces WHERE id=NEW.workspace_id FOR UPDATE;
  IF TG_OP='INSERT' OR (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL) OR (OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL) THEN
    IF NEW.team_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM teams WHERE id=NEW.team_id AND workspace_id=NEW.workspace_id AND retired_at IS NULL) THEN RAISE EXCEPTION 'Document team is unavailable' USING ERRCODE='23514',CONSTRAINT='m11_document_owner'; END IF;
    IF NEW.project_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM projects WHERE id=NEW.project_id AND workspace_id=NEW.workspace_id AND archived_at IS NULL AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Document project is unavailable' USING ERRCODE='23514',CONSTRAINT='m11_document_owner'; END IF;
    IF NEW.initiative_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM initiatives WHERE id=NEW.initiative_id AND workspace_id=NEW.workspace_id AND archived_at IS NULL AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Document initiative is unavailable' USING ERRCODE='23514',CONSTRAINT='m11_document_owner'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER m11_document_owner BEFORE INSERT OR UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION guard_document_owner();
--> statement-breakpoint
CREATE FUNCTION guard_initiative_project() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM workspaces WHERE id=NEW.workspace_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM initiatives WHERE id=NEW.initiative_id AND workspace_id=NEW.workspace_id AND archived_at IS NULL AND deleted_at IS NULL AND status NOT IN ('COMPLETED','CANCELED')) OR NOT EXISTS(SELECT 1 FROM projects WHERE id=NEW.project_id AND workspace_id=NEW.workspace_id AND archived_at IS NULL AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Initiative project link requires usable resources' USING ERRCODE='23514',CONSTRAINT='m11_initiative_project'; END IF;
  IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.workspace_id<>OLD.workspace_id OR NEW.initiative_id<>OLD.initiative_id OR NEW.project_id<>OLD.project_id) THEN RAISE EXCEPTION 'Initiative project identity is immutable' USING ERRCODE='23514',CONSTRAINT='m11_initiative_project_identity'; END IF;
  IF TG_OP='UPDATE' THEN IF NEW.revision=OLD.revision THEN NEW.revision:=OLD.revision+1; ELSIF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Revision must advance by one' USING ERRCODE='23514',CONSTRAINT='m11_revision_monotonic'; END IF; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER m11_initiative_project_guard BEFORE INSERT OR UPDATE ON initiative_projects FOR EACH ROW EXECUTE FUNCTION guard_initiative_project();
