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
| `AI_PROVIDER_NOT_CONFIGURED` | 503 | No configured provider/model supports the requested capability. |
| `AI_OUTPUT_VALIDATION_FAILED` | 503 | A provider returned JSON that failed the task's Joi schema. |
| `AI_PROMPT_NOT_FOUND` | 404 | No published prompt supports the selected provider and model. |
| `GEMINI_AUTHENTICATION_FAILED` | 503 | Gemini rejected the configured credential. |
| `GROQ_AUTHENTICATION_FAILED` | 503 | Groq rejected the configured credential. |
| `OPENROUTER_AUTHENTICATION_FAILED` | 503 | OpenRouter rejected the configured credential. |
| `*_RATE_LIMITED` | 429 | The selected provider reported rate limiting. |
| `*_TIMEOUT` | 503 | The selected provider exceeded its configured timeout. |
| `*_INVALID_JSON` | 503 | The selected provider returned malformed JSON. |
| `VALIDATION_ERROR` | 400 | A submitted URL may violate protocol, host, port, or network policy. |
| `URL_DNS_LOOKUP_FAILED` | 503 | The public hostname could not be safely resolved. |
| `URL_FETCH_TIMEOUT` | 503 | The article request exceeded its configured timeout. |
| `URL_NOT_FOUND` | 503 | The remote server reported that the page does not exist. |
| `URL_ACCESS_BLOCKED` | 503 | The remote server requires authorization or refused access. |
| `URL_CONTENT_TYPE_UNSUPPORTED` | 503 | The resource is not HTML. |
| `URL_RESPONSE_TOO_LARGE` | 503 | The response exceeded the configured byte limit. |
| `URL_REDIRECT_LIMIT_EXCEEDED` | 503 | Redirects exceeded the configured safe limit. |
| `URL_PAYWALLED` | 422 | The article appears to require a subscription. |
| `URL_LOGIN_REQUIRED` | 422 | The article appears to require login. |
| `SEARCH_PROVIDER_NOT_CONFIGURED` | 503 | No configured search provider can execute the query. |
| `SEARCH_PROVIDER_AUTHENTICATION_FAILED` | 503 | The search provider rejected its credential. |
| `SEARCH_PROVIDER_RATE_LIMITED` | 503 | The search provider refused the request because its limit was reached. |
| `SEARCH_PROVIDER_TIMEOUT` | 503 | The search request exceeded its configured timeout. |
| `SEARCH_PROVIDER_UNAVAILABLE` | 503 | The search provider or its response was unavailable. |
| `SEARCH_PROVIDER_INVALID_RESPONSE` | 503 | The search provider returned an unusable response contract. |
| `MEDIA_ASSET_UNAVAILABLE` | 503 | The attached media record or delivery URL is unavailable. |
| `MEDIA_URL_UNTRUSTED` | 422 | The media URL is outside the configured Cloudinary delivery namespace. |
| `MEDIA_RETRIEVAL_FAILED` | 503 | The trusted media object could not be retrieved. |
| `MEDIA_CONTENT_TYPE_UNSUPPORTED` | 422 | Retrieved image content has an unsupported type. |
| `MEDIA_TOO_LARGE` | 422 | The image exceeds the configured inline-analysis limit. |
| `MEDIA_TEXT_UNAVAILABLE` | 422 | No text was available for claim processing. |
| `TRANSCRIPTION_PROVIDER_NOT_CONFIGURED` | 503 | Groq credentials or a transcription model are missing. |
| `TRANSCRIPTION_AUTHENTICATION_FAILED` | 503 | Groq rejected the transcription credential. |
| `TRANSCRIPTION_RATE_LIMITED` | 503 | Groq rate-limited transcription. |
| `TRANSCRIPTION_UNAVAILABLE` | 503 | The transcription provider was unavailable. |
| `TRANSCRIPTION_INVALID_RESPONSE` | 503 | The transcription response lacked required text. |
| `REPORT_NOT_FOUND` | 404 | The report is absent, private, revoked, deleted, or not owned by the caller. |
| `REPORT_EXPORT_FAILED` | 400 | A real JSON or PDF export could not be generated. |
| `COURSE_NOT_FOUND` | 404 | A course is absent or not published for the requested audience. |
| `LESSON_NOT_FOUND` | 404 | A lesson is absent or not published for the requested audience. |
| `COURSE_SLUG_CONFLICT` | 409 | The requested course slug already exists. |
| `LESSON_CONFLICT` | 409 | A course already uses the lesson slug or sequence. |
| `COURSE_PUBLISHING_INCOMPLETE` | 409 | The course has missing or unpublished lessons. |
| `QUIZ_NOT_FOUND` | 404 | A quiz is absent or not published. |
| `QUIZ_LESSON_CONFLICT` | 409 | The lesson already has a quiz. |
| `QUIZ_PUBLISHING_INCOMPLETE` | 409 | The quiz lesson is not published. |
| `QUIZ_ATTEMPT_LIMIT_REACHED` | 409 | The learner exhausted the configured attempt count. |
| `QUIZ_ATTEMPT_CONFLICT` | 409 | A concurrent attempt already reserved the attempt number. |
| `CHALLENGE_NOT_FOUND` | 404 | A challenge is absent or outside its availability window. |
| `CHALLENGE_SLUG_CONFLICT` | 409 | The challenge slug already exists. |
| `CHALLENGE_PUBLISH_WINDOW_INVALID` | 409 | Publishing was requested outside the challenge window. |
| `CHALLENGE_ATTEMPT_LIMIT_REACHED` | 409 | The learner exhausted the configured challenge attempts. |
| `CHALLENGE_ATTEMPT_CONFLICT` | 409 | A concurrent challenge attempt reserved the attempt number. |
| `BADGE_SLUG_CONFLICT` | 409 | The badge slug already exists. |

Domain phases will add stable codes here as they are implemented. Production responses never include stack traces.
