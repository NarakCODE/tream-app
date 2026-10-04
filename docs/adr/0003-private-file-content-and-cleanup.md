# Private file content and durable cleanup

**Status:** Accepted for the authorized M10 implementation.

Files keep immutable opaque object keys. PostgreSQL owns upload intent, reserved quota, scan outcome, typed attachment links, revisions, and cleanup work; the object-storage port owns bytes. Local development uses a private filesystem directory and deployment uses an S3-compatible bucket. Application startup never creates a cloud bucket or makes it public.

Downloads pass through the authenticated API using short-lived HMAC grants bound to the requesting user, membership, session, file and attachment. Each fetch checks current session and exact target access again. This deliberately avoids direct S3 download URLs: a signed storage URL would continue working after target deletion or access revocation until its expiry. The extra API bandwidth is accepted for the MVP's bounded uploads and immediate revocation requirement.

An intent binds a file to its initial issue, project or comment and reserves declared bytes under the workspace transaction lock. Upload writes are immutable and bounded. Finalization validates the actual size, SHA-256, allowlisted content type and scanner result; only clean finalized files can be downloaded. Development scanning exists for deterministic local testing and is not a full antivirus engine. Production configuration requires ClamAV and independent signing credentials.

Files enter recoverable trash before physical removal. Durable cleanup jobs claim a lease and mark a file purging before deleting storage outside the database transaction. Restore is rejected after this claim; successful deletion marks the retained metadata purged and releases quota. Storage deletion is idempotent, so a database failure after object deletion can be retried. An expired unfinished intent follows the same cleanup mechanism. Metadata and attachment history remain as placeholders; permanent storage keys are never reassigned.

The database and object store cannot share one atomic transaction. A persisted intent precedes all writes, and cleanup metadata survives a failed upload acknowledgement or finalization. This trades immediate cross-store atomicity for explicit recovery and reconciliation through durable jobs. Operational failures use stable error codes rather than provider credentials, storage paths, scanner signatures or object bytes in events and audit metadata.
