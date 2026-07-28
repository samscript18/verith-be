# Error Codes

| Code | HTTP status | Meaning |
| --- | ---: | --- |
| `VALIDATION_ERROR` | 400 | DTO validation failed; safe field details are returned. |
| `BAD_REQUEST` | 400 | The request is malformed outside DTO validation. |
| `INTERNAL_SERVER_ERROR` | 500 | An unexpected server error occurred. |
| `INVALID_CREDENTIALS` | 401 | Login credentials are invalid. |
| `EMAIL_VERIFICATION_REQUIRED` | 401 | The account must verify its email. |
| `INVALID_REFRESH_TOKEN` | 401 | The refresh credential is invalid, revoked, or expired. |
| `REFRESH_TOKEN_REUSE_DETECTED` | 401 | A rotated credential was reused; its family was revoked. |
| `SESSION_REVOKED` | 401 | The access token references an inactive session. |
| `CSRF_VALIDATION_FAILED` | 401 | Cookie refresh CSRF validation failed. |
| `USER_ALREADY_EXISTS` | 409 | Normalized email or username is already registered. |
| `MEDIA_ASSET_NOT_FOUND` | 404 | The asset does not exist, is expired, or is not owned by the caller. |
| `UPLOAD_SIGNATURE_INVALID` | 409 | Cloudinary's upload response signature could not be verified. |
| `UPLOAD_POLICY_MISMATCH` | 409 | Provider metadata violates the signed type, owner, size, or format policy. |
| `UPLOAD_ASSET_TYPE_MISMATCH` | 409 | An asset was submitted to an incompatible attachment flow. |
| `UPLOAD_CONFIRMATION_CONFLICT` | 409 | The pending upload was concurrently confirmed or changed. |
| `UPLOAD_ATTACHMENT_CONFLICT` | 409 | A confirmed asset could not be attached to its target resource. |
| `CLOUDINARY_NOT_CONFIGURED` | 503 | The Cloudinary integration has no complete credential set. |
| `CLOUDINARY_ASSET_UNAVAILABLE` | 503 | Cloudinary could not return the uploaded asset metadata. |
| `CLOUDINARY_INVALID_RESPONSE` | 503 | Cloudinary returned an unusable response. |
| `CLOUDINARY_DELETE_FAILED` | 503 | Cloudinary did not acknowledge asset deletion. |
| `VERIFICATION_NOT_FOUND` | 404 | The verification is absent, deleted, or not owned by the caller. |
| `IDEMPOTENCY_KEY_REUSED` | 409 | The key was previously used with a different request fingerprint. |
| `IDEMPOTENCY_RESOURCE_UNAVAILABLE` | 409 | The resource reserved by a concurrent idempotent request is unavailable. |
| `VERIFICATION_NOT_CANCELLABLE` | 409 | The verification is already in a terminal state. |
| `VERIFICATION_NOT_RETRYABLE` | 409 | The verification is neither failed nor cancelled. |
| `VERIFICATION_DELETE_CONFLICT` | 409 | Active processing must be cancelled before deletion. |
| `VERIFICATION_QUEUE_UNAVAILABLE` | 503 | BullMQ could not accept the durable orchestration job. |

Domain phases will add stable codes here as they are implemented. Production responses never include stack traces.
