CREATE TYPE "public"."team_member_role" AS ENUM('ADMIN', 'MEMBER');--> statement-breakpoint
CREATE TYPE "public"."team_visibility" AS ENUM('WORKSPACE', 'PRIVATE');--> statement-breakpoint
DROP INDEX "issue_statuses_team_name_idx";--> statement-breakpoint
DROP INDEX "teams_workspace_key_active_idx";--> statement-breakpoint
DROP INDEX "issue_statuses_team_position_idx";--> statement-breakpoint
ALTER TABLE "issue_statuses" ADD COLUMN "retired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD COLUMN "workspace_id" text;--> statement-breakpoint
UPDATE "team_memberships" tm SET "workspace_id"=t."workspace_id" FROM "teams" t WHERE t."id"=tm."team_id";--> statement-breakpoint
ALTER TABLE "team_memberships" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD COLUMN "role" "team_member_role" DEFAULT 'MEMBER' NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "visibility" "team_visibility" DEFAULT 'WORKSPACE' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 IF EXISTS(SELECT workspace_id,key FROM teams GROUP BY workspace_id,key HAVING count(*)>1) THEN
 RAISE EXCEPTION 'Resolve reused historical team keys before migration' USING ERRCODE='23505'; END IF;
 IF EXISTS(SELECT 1 FROM teams WHERE key !~ '^[A-Z][A-Z0-9]{1,9}$') THEN
 RAISE EXCEPTION 'Resolve noncanonical historical team keys before migration' USING ERRCODE='23514'; END IF;
END $$;
--> statement-breakpoint
UPDATE teams t SET next_issue_number=GREATEST(t.next_issue_number,COALESCE((SELECT max(number)+1 FROM issues WHERE team_id=t.id),1));
--> statement-breakpoint
WITH candidates AS (SELECT DISTINCT ON(team_id) id FROM issue_statuses WHERE category IN ('BACKLOG','UNSTARTED') ORDER BY team_id,is_default DESC,CASE WHEN category='UNSTARTED' THEN 0 ELSE 1 END,position,id)
UPDATE issue_statuses s SET is_default=(s.id IN (SELECT id FROM candidates));
--> statement-breakpoint
INSERT INTO issue_statuses(id,team_id,name,category,position,is_default)
SELECT gen_random_uuid()::text,t.id,'Ready '||left(gen_random_uuid()::text,8),'UNSTARTED',COALESCE((SELECT max(position)+1 FROM issue_statuses WHERE team_id=t.id),0),true
FROM teams t WHERE t.retired_at IS NULL AND NOT EXISTS(SELECT FROM issue_statuses s WHERE s.team_id=t.id AND s.is_default);
--> statement-breakpoint
INSERT INTO team_memberships(id,workspace_id,team_id,membership_id,role)
SELECT gen_random_uuid()::text,t.workspace_id,t.id,m.id,'ADMIN'
FROM teams t JOIN LATERAL(SELECT id FROM memberships WHERE workspace_id=t.workspace_id AND state='ACTIVE' AND role='OWNER' ORDER BY created_at,id LIMIT 1) m ON true
WHERE t.retired_at IS NULL
ON CONFLICT(team_id,membership_id) DO UPDATE SET role='ADMIN';
--> statement-breakpoint
CREATE UNIQUE INDEX "issue_statuses_team_name_active_idx" ON "issue_statuses" USING btree ("team_id",lower(trim("name"))) WHERE "issue_statuses"."retired_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "issue_statuses_team_default_active_idx" ON "issue_statuses" USING btree ("team_id") WHERE "issue_statuses"."is_default" AND "issue_statuses"."retired_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "issue_statuses_team_identity_idx" ON "issue_statuses" USING btree ("team_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_workspace_key_permanent_idx" ON "teams" USING btree ("workspace_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_workspace_identity_idx" ON "teams" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_statuses_team_position_idx" ON "issue_statuses" USING btree ("team_id","position") WHERE "issue_statuses"."retired_at" IS NULL;--> statement-breakpoint
ALTER TABLE "issue_statuses" ADD CONSTRAINT "issue_statuses_position_check" CHECK ("issue_statuses"."position" >= 0);--> statement-breakpoint
ALTER TABLE "issue_statuses" ADD CONSTRAINT "issue_statuses_default_usable_check" CHECK (NOT "issue_statuses"."is_default" OR ("issue_statuses"."retired_at" IS NULL AND "issue_statuses"."category" IN ('BACKLOG','UNSTARTED')));--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_canonical_key_check" CHECK ("teams"."key" ~ '^[A-Z][A-Z0-9]{1,9}$');--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_cycle_settings_check" CHECK ("teams"."cycle_duration_weeks" BETWEEN 1 AND 8 AND "teams"."cycle_start_day" BETWEEN 0 AND 6 AND "teams"."cycle_cooldown_days" BETWEEN 0 AND 14 AND "teams"."cycle_cooldown_days" < "teams"."cycle_duration_weeks" * 7 AND "teams"."upcoming_cycles_count" BETWEEN 1 AND 10);--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_team_tenant_fk" FOREIGN KEY ("workspace_id","team_id") REFERENCES "public"."teams"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_member_tenant_fk" FOREIGN KEY ("workspace_id","membership_id") REFERENCES "public"."memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;
