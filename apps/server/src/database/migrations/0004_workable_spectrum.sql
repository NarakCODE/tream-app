CREATE TYPE "public"."deal_stage" AS ENUM('DISCOVERY');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('TODO', 'IN_PROGRESS', 'DONE');--> statement-breakpoint
CREATE TABLE "deal_contacts" (
	"workspace_id" text NOT NULL,
	"deal_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_contacts_deal_id_contact_id_pk" PRIMARY KEY("deal_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"company_id" text,
	"title" text NOT NULL,
	"amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"stage" "deal_stage" DEFAULT 'DISCOVERY' NOT NULL,
	"close_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "deals_amount_nonnegative_check" CHECK ("deals"."amount" >= 0),
	CONSTRAINT "deals_currency_format_check" CHECK ("deals"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"contact_id" text,
	"deal_id" text,
	"assignee_id" text,
	"title" text NOT NULL,
	"status" "task_status" DEFAULT 'TODO' NOT NULL,
	"due_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "deals_workspace_id_unique_idx" ON "deals" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "deal_contacts" ADD CONSTRAINT "deal_contacts_workspace_deal_fk" FOREIGN KEY ("workspace_id","deal_id") REFERENCES "public"."deals"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_workspace_id_unique_idx" ON "contacts" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "deal_contacts" ADD CONSTRAINT "deal_contacts_workspace_contact_fk" FOREIGN KEY ("workspace_id","contact_id") REFERENCES "public"."contacts"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_workspace_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_memberships_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deal_contacts_workspace_contact_deal_idx" ON "deal_contacts" USING btree ("workspace_id","contact_id","deal_id");--> statement-breakpoint
CREATE INDEX "deals_workspace_created_id_active_idx" ON "deals" USING btree ("workspace_id","created_at","id") WHERE "deals"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "deals_workspace_stage_created_id_active_idx" ON "deals" USING btree ("workspace_id","stage","created_at","id") WHERE "deals"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "deals_workspace_company_created_id_active_idx" ON "deals" USING btree ("workspace_id","company_id","created_at","id") WHERE "deals"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "tasks_workspace_created_id_active_idx" ON "tasks" USING btree ("workspace_id","created_at","id") WHERE "tasks"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "tasks_workspace_status_created_id_active_idx" ON "tasks" USING btree ("workspace_id","status","created_at","id") WHERE "tasks"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "tasks_workspace_assignee_created_id_active_idx" ON "tasks" USING btree ("workspace_id","assignee_id","created_at","id") WHERE "tasks"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "tasks_workspace_contact_active_idx" ON "tasks" USING btree ("workspace_id","contact_id") WHERE "tasks"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "tasks_workspace_deal_active_idx" ON "tasks" USING btree ("workspace_id","deal_id") WHERE "tasks"."deleted_at" is null;
