# Privacy and Retention

Verith minimizes operational logs and redacts authorization, cookies,
passwords, and token-shaped fields. Submitted claims, media, transcripts, and
provider credentials are not logged by default.

## Account exports

`POST /api/v1/privacy/exports` creates a durable BullMQ export job and returns a
one-time 256-bit download token. The raw token is never stored or placed in a
URL; downloads present it through `X-Data-Export-Token`. Export JSON is
encrypted at rest with AES-256-GCM using `DATA_EXPORT_ENCRYPTION_KEY`, expires
after `EXPORT_RETENTION_HOURS`, and is downloadable only by the authenticated
owner presenting the token.

Exports include profile/preferences, safe session metadata, verification
metadata, reports, learning progress, quiz/challenge attempts, reward history,
notifications, and consent/link-state WhatsApp metadata. They exclude
passwords, refresh tokens, IP hashes, phone identifiers, internal prompts,
provider internals, and administrative notes.

## Account erasure

Deletion requests have a configurable
`ACCOUNT_DELETION_GRACE_DAYS` cancellation period. The distributed retention
job then:

1. deletes every owned Cloudinary asset and requires provider acknowledgement;
2. deletes sessions, auth tokens, verification data, reports, media metadata,
   learning/quiz/challenge activity, rewards, notifications, and WhatsApp
   linkage;
3. replaces direct account identifiers with unique tombstone values and removes
   credentials/profile fields;
4. retains append-only audit records under the pseudonymous internal actor ID
   for the configured legal/security retention period.

If Cloudinary is unavailable or rejects deletion, erasure remains pending and
is retried; Verith never reports success while provider media remains.

## Scheduled retention

The scheduler runs once daily under a Redis `NX` lock. It removes expired
sessions and exports, WhatsApp metadata older than
`WHATSAPP_METADATA_RETENTION_DAYS`, and audit logs older than
`AUDIT_LOG_RETENTION_DAYS`. MongoDB TTL indexes independently expire auth
tokens, privacy export payloads, idempotency records, and provider execution
records. Orphaned Cloudinary uploads are deleted hourly with provider
acknowledgement.

Production retention values require legal review for every operating
jurisdiction. Backups age out according to the separate disaster-recovery
policy; restored backups must replay erasure tombstones before serving traffic.
