# Verification Pipeline

## Phase 4 lifecycle

Authenticated clients create a verification with `POST /api/v1/verifications` and an `Idempotency-Key` header containing 8–128 characters. The API immediately persists the request and its `RECEIVED` event, then enqueues a deterministic BullMQ orchestration job. It never holds the HTTP request open for analysis.

The current worker performs only the lifecycle initialization owned by Phase 4:

1. Validate the persisted input.
2. Change the status to `PROCESSING`.
3. Persist `INPUT_VALIDATION` as completed.
4. Move to `CONTENT_EXTRACTION`.
5. Persist `CONTENT_EXTRACTION_PENDING`.

## Phase 6 text and URL processing

Text and URL inputs now continue from content extraction through:

1. Unicode and whitespace normalization.
2. Safe article retrieval and main-content extraction for URLs.
3. Deterministic language detection.
4. Schema-constrained factual claim extraction.
5. Deterministic source-span validation and claim normalization.
6. Schema-constrained evidence-search query generation.
7. Transition to `EVIDENCE_SEARCH` as pending.

The pipeline does not search for evidence or generate a verdict in this phase. If no AI provider/model is configured, claim extraction is recorded as unavailable and the verification fails with an explicit provider code.

Claims are stored separately with type, importance, verifiability, time sensitivity, entities, dates, locations, quantities, exact source span, current-information requirement, search hints, and bounded categorized queries. Opinions, predictions, value judgments, and insufficient-context statements remain distinct from externally verifiable claims.

`GET /api/v1/verifications/:id/claims` returns the authenticated owner's extracted claims and planned queries.

Media inputs remain at content extraction until Phase 9.

## Phase 7 search and evidence

Text and URL inputs now continue through:

1. Categorized claim queries sent through the configured real search provider.
2. Safe retrieval and extraction of selected public source pages.
3. Canonical URL, tracking-parameter, and content-hash deduplication.
4. Possible syndicated-copy detection using publisher, title similarity, and publication date.
5. Deterministic relevance, directness, recency, and authority scoring.
6. Durable evidence and source-access records.
7. Transition to `CLAIM_EVALUATION` as pending.

Search snippets are never treated as conclusive evidence. An inaccessible
result is persisted with an explicit access status and no relevant excerpt.
Available excerpts are selected only from retrieved page content. Every
relationship remains `INCONCLUSIVE` until Phase 8 compares claims and evidence.

`GET /api/v1/verifications/:id/evidence` is owner-scoped and returns source,
access, ranking, and lineage fields. Duplicate and syndicated records point to
their earlier lineage record rather than being silently counted as independent
corroboration.

## Phase 8 verification analysis

Text and URL inputs now continue from evidence normalization through claim
evaluation, manipulation analysis, bias analysis, missing-context analysis, and
source-credibility analysis. The current boundary stops at
`REPORT_SYNTHESIS` as pending for Phase 10.

AI output supplies schema-validated evidence relationships and bounded textual
findings. Application code validates all IDs and offsets, computes confidence,
derives claim and overall verdicts, and calculates risk. The complete method is
documented in [verification-analysis.md](verification-analysis.md).

`GET /api/v1/verifications/:id/analysis` is owner-scoped and returns claim
evaluations, confidence factors, uncertainty, limitations, overall verdict,
risk, and analysis findings.

## Phase 9 image and audio

Image and screenshot inputs pass through attached-asset validation, trusted
Cloudinary retrieval, Gemini image/OCR analysis, and the normal claim/evidence
pipeline when visible text exists. Audio inputs use real Groq transcription
with segment timestamps before entering that same pipeline.

Media-specific details and honest unsupported states are documented in
[media-processing.md](media-processing.md). `GET
/api/v1/verifications/:id/media` is owner-scoped.

## Phase 10 reports

The pipeline now synthesizes and validates `report.v1` after analysis. A
verification reaches `COMPLETED` and 100% only after report validation passes.
Invalid reports remain durable for investigation and do not complete the
verification.

Sharing, privacy projection, exports, feedback, and versioning are documented
in [reports.md](reports.md).

## Safe URL retrieval

URL retrieval is performed only by the dedicated safe-fetch service. It permits HTTP and HTTPS on their standard ports, rejects credentials and local hostnames, resolves DNS before connecting, rejects every private/loopback/link-local/reserved answer, and pins the connection to the validated address. Every redirect repeats the full validation.

Responses use manual redirects, bounded redirect count, timeout, byte limit, HTML-only content types, and an identified bot user agent. Article parsing removes scripts, styles, frames, navigation, forms, advertisements, and other non-content elements; only extracted plain text and safe metadata are persisted.

Unavailable URL states are preserved as `LOGIN_REQUIRED`, `PAYWALLED`, `BLOCKED`, `UNSUPPORTED`, `NOT_FOUND`, `TIMEOUT`, or `UNSAFE_URL`. The fetcher does not bypass access controls or paywalls. Operators remain responsible for configuring a truthful bot URL and complying with publisher robots and legal policies.

## Inputs and ownership

The public authenticated route accepts `TEXT`, `URL`, `IMAGE`, `SCREENSHOT`, and `AUDIO`. WhatsApp source types are rejected here and will be accepted only through the signed webhook flow. Media requests require a confirmed, compatible, owner-controlled asset. Attachment uses an atomic conditional update so an asset cannot be assigned to two verifications.

All reads, mutations, event history, and streams are scoped to the authenticated owner. Missing and foreign records return the same not-found response.

## Idempotency and jobs

Idempotency records store user, key, SHA-256 request fingerprint, resource ID, and a 24-hour TTL. The unique user/key index prevents concurrent duplicates. Repeating the same payload returns the original verification; changing the payload returns `IDEMPOTENCY_KEY_REUSED`.

Jobs carry job ID, verification ID, request ID, attempt, schema version, and creation time. Deterministic BullMQ job IDs and state checks make initialization safe to retry. Jobs use three exponential-backoff attempts and bounded completed/failed retention. Queue submission failures mark the verification failed and expose `VERIFICATION_QUEUE_UNAVAILABLE`.

## Events and SSE

Events live in a separate collection with a per-verification monotonic sequence. `GET /api/v1/verifications/:id/events?after=N` supports catch-up. The SSE endpoint first sends persisted events after the supplied sequence, then live in-process events and 15-second heartbeats.

Clients should reconnect with the last processed sequence in the `after` query. Persisted catch-up prevents event loss across API restarts. In-process fan-out serves clients connected to the same API instance; a Redis-backed cross-instance fan-out adapter is required before horizontally scaling the API.

Lifecycle events and cross-domain events are separate concerns. Lifecycle
events drive owner history and SSE. After a verification completes or fails,
the worker writes a typed domain event to the durable outbox. The scheduler
then invokes idempotent notification and WhatsApp consumers without coupling
those modules to the verification worker.

## Lifecycle operations

- Cancellation records `cancelRequestedAt`, moves the record to `CANCELLED`, and emits a durable event.
- Retry is restricted to failed or cancelled records and creates a new deterministic job generation.
- Visibility supports `PRIVATE`, `UNLISTED`, and `PUBLIC`; public report exposure is deferred to the reports phase.
- Delete is a soft lifecycle delete and is rejected while processing is active.
