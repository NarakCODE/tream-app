ALTER TABLE "cycles" ADD COLUMN "completion_next_cycle_id" text;--> statement-breakpoint
ALTER TABLE "cycles" ADD COLUMN "scheduler_error" text;--> statement-breakpoint
ALTER TABLE "cycles" ADD COLUMN "scheduler_failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_completion_target_fk" FOREIGN KEY ("team_id","completion_next_cycle_id") REFERENCES "public"."cycles"("team_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycles" ADD CONSTRAINT "m08_cycle_completion_target" CHECK ("cycles"."completion_next_cycle_id" IS NULL OR ("cycles"."completion_next_cycle_id" <> "cycles"."id" AND "cycles"."completed_at" IS NOT NULL));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_new_cycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM teams WHERE id=NEW.team_id AND workspace_id=NEW.workspace_id AND retired_at IS NULL) THEN RAISE EXCEPTION 'Retired teams cannot receive cycles' USING ERRCODE='23514',CONSTRAINT='m08_cycle_team_active'; END IF;
  IF TG_OP='UPDATE' AND (OLD.completed_at IS NOT NULL OR OLD.canceled_at IS NOT NULL) AND (NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.ends_at IS DISTINCT FROM OLD.ends_at OR NEW.completed_at IS DISTINCT FROM OLD.completed_at OR NEW.canceled_at IS DISTINCT FROM OLD.canceled_at OR NEW.completion_next_cycle_id IS DISTINCT FROM OLD.completion_next_cycle_id) THEN RAISE EXCEPTION 'Finished cycle windows and terminal state are immutable' USING ERRCODE='23514',CONSTRAINT='m08_cycle_terminal'; END IF;
  RETURN NEW;
END $$;
