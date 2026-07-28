# Privacy and Retention

Phase 1 logs operational metadata only and redacts authorization, cookies, passwords, and token-shaped fields. Submitted claims, media contents, transcripts, and provider keys must not be logged by default.

Pending upload records expire after `UPLOAD_PENDING_TTL_MINUTES`. An hourly cleanup attempts real provider deletion and marks the record deleted only after Cloudinary acknowledges the operation. Failed cleanup is recorded with a safe failure code and retried later. Confirmed unattached assets are owner-managed; attached assets cannot be deleted through the generic asset endpoint.

Media binary content is stored by Cloudinary, never in MongoDB. The database stores verified provider metadata and the secure delivery URL. Replacement-avatar retirement and legal-erasure orchestration remain part of the later privacy-hardening phase.
