CREATE TABLE "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"industry" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "companies_workspace_id_unique_idx" ON "companies" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "companies_workspace_created_id_idx" ON "companies" USING btree ("workspace_id","created_at","id");--> statement-breakpoint
CREATE INDEX "companies_workspace_domain_active_idx" ON "companies" USING btree ("workspace_id","domain") WHERE "companies"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_workspace_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action NOT VALID;
