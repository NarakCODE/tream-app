ALTER TABLE "files" ADD COLUMN "source_attachment_id" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_file_identity_idx" ON "attachments" USING btree ("workspace_id","file_id","id");
--> statement-breakpoint
-- The cyclic origin/file relationship is deferred so an upload intent can
-- preallocate both identities and insert the file before its typed attachment.
ALTER TABLE files ADD CONSTRAINT m10_file_origin_tenant_fk FOREIGN KEY(workspace_id,id,source_attachment_id) REFERENCES attachments(workspace_id,file_id,id) DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_private_file() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'File placeholders and keys are retained' USING ERRCODE='23514',CONSTRAINT='m10_file_retention'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.created_by_id IS DISTINCT FROM OLD.created_by_id OR NEW.source_attachment_id IS DISTINCT FROM OLD.source_attachment_id OR NEW.storage_key IS DISTINCT FROM OLD.storage_key OR NEW.name IS DISTINCT FROM OLD.name OR NEW.declared_mime_type IS DISTINCT FROM OLD.declared_mime_type OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes OR NEW.sha256 IS DISTINCT FROM OLD.sha256 OR NEW.upload_expires_at IS DISTINCT FROM OLD.upload_expires_at THEN
    RAISE EXCEPTION 'File intent identity is immutable' USING ERRCODE='23514',CONSTRAINT='m10_file_identity';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status='PENDING' AND NEW.status IN('UPLOADED','QUARANTINED','EXPIRED','DELETED')) OR
    (OLD.status='UPLOADED' AND NEW.status IN('READY','QUARANTINED','EXPIRED','DELETED')) OR
    (OLD.status='QUARANTINED' AND NEW.status IN('READY','EXPIRED','DELETED')) OR
    (OLD.status='READY' AND NEW.status='DELETED') OR
    (OLD.status='DELETED' AND NEW.status IN('READY','PURGING')) OR
    (OLD.status='EXPIRED' AND NEW.status='PURGING') OR
    (OLD.status='PURGING' AND NEW.status='PURGED')
  ) THEN RAISE EXCEPTION 'Invalid file lifecycle transition' USING ERRCODE='23514',CONSTRAINT='m10_file_transition'; END IF;
  IF OLD.ready_at IS NOT NULL AND (NEW.actual_size_bytes IS DISTINCT FROM OLD.actual_size_bytes OR NEW.actual_mime_type IS DISTINCT FROM OLD.actual_mime_type OR NEW.actual_sha256 IS DISTINCT FROM OLD.actual_sha256 OR NEW.ready_at IS DISTINCT FROM OLD.ready_at) THEN
    RAISE EXCEPTION 'Verified content identity is immutable' USING ERRCODE='23514',CONSTRAINT='m10_file_verified_identity';
  END IF;
  IF OLD.status='DELETED' AND NEW.status='READY' AND EXISTS(SELECT 1 FROM storage_cleanup_jobs WHERE file_id=NEW.id AND status='PROCESSING') THEN RAISE EXCEPTION 'Claimed cleanup cannot be restored' USING ERRCODE='23514',CONSTRAINT='m10_file_restore_claimed'; END IF;
  IF NEW.revision=OLD.revision THEN NEW.revision:=OLD.revision+1;
  ELSIF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'File revision must advance by one' USING ERRCODE='23514',CONSTRAINT='m10_file_revision_monotonic'; END IF;
  RETURN NEW;
END $$;
