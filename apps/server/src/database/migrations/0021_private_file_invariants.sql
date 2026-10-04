-- Storage I/O is outside transactions. The persisted lease and PURGING barrier
-- precede deletion; retries can safely remove an already absent object.
CREATE FUNCTION protect_private_file() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'File placeholders and keys are retained' USING ERRCODE='23514',CONSTRAINT='m10_file_retention'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.created_by_id IS DISTINCT FROM OLD.created_by_id OR NEW.storage_key IS DISTINCT FROM OLD.storage_key OR NEW.name IS DISTINCT FROM OLD.name OR NEW.declared_mime_type IS DISTINCT FROM OLD.declared_mime_type OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes OR NEW.sha256 IS DISTINCT FROM OLD.sha256 OR NEW.upload_expires_at IS DISTINCT FROM OLD.upload_expires_at THEN
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
--> statement-breakpoint
CREATE TRIGGER m10_file_guard BEFORE UPDATE OR DELETE ON files FOR EACH ROW EXECUTE FUNCTION protect_private_file();
--> statement-breakpoint
CREATE FUNCTION guard_private_attachment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE f files%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Attachment placeholders are retained' USING ERRCODE='23514',CONSTRAINT='m10_attachment_retention'; END IF;
  PERFORM 1 FROM workspaces WHERE id=NEW.workspace_id FOR UPDATE;
  IF TG_OP='UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.file_id IS DISTINCT FROM OLD.file_id OR NEW.created_by_id IS DISTINCT FROM OLD.created_by_id OR NEW.issue_id IS DISTINCT FROM OLD.issue_id OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.comment_id IS DISTINCT FROM OLD.comment_id THEN RAISE EXCEPTION 'Attachment owner is immutable' USING ERRCODE='23514',CONSTRAINT='m10_attachment_identity'; END IF;
    IF NEW.revision=OLD.revision THEN NEW.revision:=OLD.revision+1;
    ELSIF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Attachment revision must advance by one' USING ERRCODE='23514',CONSTRAINT='m10_attachment_revision_monotonic'; END IF;
  END IF;
  IF TG_OP='INSERT' OR (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL) THEN
    SELECT * INTO f FROM files WHERE id=NEW.file_id AND workspace_id=NEW.workspace_id FOR UPDATE;
    IF NOT FOUND OR NOT (f.status='READY' OR (TG_OP='INSERT' AND f.status='PENDING' AND f.created_by_id=NEW.created_by_id AND f.upload_expires_at>now() AND NOT EXISTS(SELECT 1 FROM attachments WHERE file_id=f.id))) THEN RAISE EXCEPTION 'Attachment requires ready content or an initial upload intent' USING ERRCODE='23514',CONSTRAINT='m10_attachment_file_usable'; END IF;
    IF NEW.issue_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM issues WHERE id=NEW.issue_id AND workspace_id=NEW.workspace_id AND deleted_at IS NULL AND archived_at IS NULL) THEN RAISE EXCEPTION 'Attachment issue is not usable' USING ERRCODE='23514',CONSTRAINT='m10_attachment_target_usable'; END IF;
    IF NEW.project_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM projects WHERE id=NEW.project_id AND workspace_id=NEW.workspace_id AND deleted_at IS NULL AND archived_at IS NULL) THEN RAISE EXCEPTION 'Attachment project is not usable' USING ERRCODE='23514',CONSTRAINT='m10_attachment_target_usable'; END IF;
    IF NEW.comment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM comments WHERE id=NEW.comment_id AND workspace_id=NEW.workspace_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Attachment comment is not usable' USING ERRCODE='23514',CONSTRAINT='m10_attachment_target_usable'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER m10_attachment_guard BEFORE INSERT OR UPDATE OR DELETE ON attachments FOR EACH ROW EXECUTE FUNCTION guard_private_attachment();
--> statement-breakpoint
CREATE FUNCTION protect_cleanup_job() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE key text;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Cleanup job history is retained' USING ERRCODE='23514',CONSTRAINT='m10_cleanup_retention'; END IF;
  SELECT storage_key INTO key FROM files WHERE id=NEW.file_id AND workspace_id=NEW.workspace_id FOR UPDATE;
  IF key IS NULL OR key<>NEW.storage_key THEN RAISE EXCEPTION 'Cleanup key must match its file' USING ERRCODE='23514',CONSTRAINT='m10_cleanup_storage_key'; END IF;
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.file_id IS DISTINCT FROM OLD.file_id OR NEW.storage_key IS DISTINCT FROM OLD.storage_key OR NEW.reason IS DISTINCT FROM OLD.reason) THEN RAISE EXCEPTION 'Cleanup identity is immutable' USING ERRCODE='23514',CONSTRAINT='m10_cleanup_identity'; END IF;
  IF TG_OP='UPDATE' AND OLD.status IN('SUCCEEDED','CANCELED') AND NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'Finished cleanup cannot be reopened' USING ERRCODE='23514',CONSTRAINT='m10_cleanup_terminal'; END IF;
  IF TG_OP='UPDATE' AND NEW.attempt_count<OLD.attempt_count THEN RAISE EXCEPTION 'Cleanup attempts cannot decrease' USING ERRCODE='23514',CONSTRAINT='m10_cleanup_attempt_monotonic'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER m10_cleanup_guard BEFORE INSERT OR UPDATE OR DELETE ON storage_cleanup_jobs FOR EACH ROW EXECUTE FUNCTION protect_cleanup_job();
--> statement-breakpoint
CREATE FUNCTION require_file_cleanup_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fid text; s file_status;
BEGIN
  IF TG_TABLE_NAME='files' THEN fid:=COALESCE(NEW.id,OLD.id); ELSE fid:=COALESCE(NEW.file_id,OLD.file_id); END IF;
  SELECT status INTO s FROM files WHERE id=fid FOR UPDATE;
  IF s='READY' AND EXISTS(SELECT 1 FROM storage_cleanup_jobs WHERE file_id=fid AND status IN('PENDING','PROCESSING','FAILED')) THEN RAISE EXCEPTION 'Ready files cannot retain active cleanup jobs' USING ERRCODE='23514',CONSTRAINT='m10_file_cleanup_ready'; END IF;
  IF s='PURGED' AND EXISTS(SELECT 1 FROM storage_cleanup_jobs WHERE file_id=fid AND status IN('PENDING','PROCESSING','FAILED')) THEN RAISE EXCEPTION 'Purged files require completed cleanup' USING ERRCODE='23514',CONSTRAINT='m10_file_cleanup_purged'; END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER m10_file_cleanup_consistency AFTER INSERT OR UPDATE ON files DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_file_cleanup_consistency();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER m10_job_cleanup_consistency AFTER INSERT OR UPDATE ON storage_cleanup_jobs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_file_cleanup_consistency();
