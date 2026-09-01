CREATE TYPE "public"."contact_status" AS ENUM('LEAD');--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"company_id" text,
	"first_name" text,
	"last_name" text,
	"email" text NOT NULL,
	"phone" text,
	"status" "contact_status" DEFAULT 'LEAD' NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_workspace_email_active_idx" ON "contacts" USING btree ("workspace_id",lower("email")) WHERE "contacts"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "contacts_workspace_created_id_idx" ON "contacts" USING btree ("workspace_id","created_at","id");