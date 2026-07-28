# Privacy and Retention

Phase 1 logs operational metadata only and redacts authorization, cookies, passwords, and token-shaped fields. Submitted claims, media contents, transcripts, and provider keys must not be logged by default.

Pending upload records expire after `UPLOAD_PENDING_TTL_MINUTES`. An hourly cleanup attempts real provider deletion and marks the record deleted only after Cloudinary acknowledges the operation. Failed cleanup is recorded with a safe failure code and retried later. Confirmed unattached assets are owner-managed; attached assets cannot be deleted through the generic asset endpoint.

Media binary content is stored by Cloudinary, never in MongoDB. The database stores verified provider metadata and the secure delivery URL. Replacement-avatar retirement and legal-erasure orchestration remain part of the later privacy-hardening phase.

Verification inputs are owner-scoped and omitted from list/detail response DTOs in Phase 4. Idempotency records expire automatically after 24 hours. Soft-deleted verification content remains stored until the legal-erasure and retention jobs are implemented in the privacy-hardening phase; operators must not describe soft deletion as legal erasure.
# Report sharing and exports

Public report output is a dedicated allowlisted projection. It excludes user
identity, ownership IDs, provider execution details, prompt versions, private
asset URLs, and full audio transcripts. Unlisted slugs contain 192 random bits
and are revoked by removing the slug and recording the revocation time.

Export records expire after 24 hours by current policy. Synchronous response
bytes are not stored in MongoDB; only format, size, SHA-256 hash, state, and
failure metadata are retained.
