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

Domain phases will add stable codes here as they are implemented. Production responses never include stack traces.
