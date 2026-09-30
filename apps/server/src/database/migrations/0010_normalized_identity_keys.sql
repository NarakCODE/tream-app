-- Custom SQL migration file, put your code below! --
-- Refuse ambiguous legacy identities; operator reconciliation must precede
-- normalization. Never silently merge users or their tenant memberships.
DO $$ BEGIN
  IF EXISTS (SELECT lower(trim(email)) FROM users GROUP BY lower(trim(email)) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Resolve normalized user email collisions before migration' USING ERRCODE='23505';
  END IF;
  IF EXISTS (SELECT lower(trim(slug)) FROM workspaces GROUP BY lower(trim(slug)) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Resolve normalized workspace slug collisions before migration' USING ERRCODE='23505';
  END IF;
END $$;
--> statement-breakpoint
UPDATE users SET email = lower(trim(email)) WHERE email <> lower(trim(email));
--> statement-breakpoint
UPDATE workspaces SET slug = lower(trim(slug)) WHERE slug <> lower(trim(slug));
--> statement-breakpoint
SET CONSTRAINTS ALL IMMEDIATE;
--> statement-breakpoint
ALTER TABLE users ADD CONSTRAINT users_email_normalized CHECK (email = lower(trim(email)));
--> statement-breakpoint
ALTER TABLE workspaces ADD CONSTRAINT workspace_slug_normalized CHECK (slug = lower(trim(slug)));
--> statement-breakpoint
CREATE INDEX auth_mail_ready_idx ON auth_mail_deliveries(state,available_at,lease_until);
