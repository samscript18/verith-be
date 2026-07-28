# Error Codes

| Code | HTTP status | Meaning |
| --- | ---: | --- |
| `VALIDATION_ERROR` | 400 | DTO validation failed; safe field details are returned. |
| `BAD_REQUEST` | 400 | The request is malformed outside DTO validation. |
| `INTERNAL_SERVER_ERROR` | 500 | An unexpected server error occurred. |

Domain phases will add stable codes here as they are implemented. Production responses never include stack traces.
