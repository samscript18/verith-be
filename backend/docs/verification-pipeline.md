# Verification Pipeline

## Phase 4 lifecycle

Authenticated clients create a verification with `POST /api/v1/verifications` and an `Idempotency-Key` header containing 8–128 characters. The API immediately persists the request and its `RECEIVED` event, then enqueues a deterministic BullMQ orchestration job. It never holds the HTTP request open for analysis.

The current worker performs only the lifecycle initialization owned by Phase 4:

1. Validate the persisted input.
2. Change the status to `PROCESSING`.
3. Persist `INPUT_VALIDATION` as completed.
4. Move to `CONTENT_EXTRACTION`.
5. Persist `CONTENT_EXTRACTION_PENDING`.

Content extraction and later analysis are intentionally not simulated. Their implementation belongs to later phases, so a Phase 4 verification remains at the pending extraction stage.

## Inputs and ownership

The public authenticated route accepts `TEXT`, `URL`, `IMAGE`, `SCREENSHOT`, and `AUDIO`. WhatsApp source types are rejected here and will be accepted only through the signed webhook flow. Media requests require a confirmed, compatible, owner-controlled asset. Attachment uses an atomic conditional update so an asset cannot be assigned to two verifications.

All reads, mutations, event history, and streams are scoped to the authenticated owner. Missing and foreign records return the same not-found response.

## Idempotency and jobs

Idempotency records store user, key, SHA-256 request fingerprint, resource ID, and a 24-hour TTL. The unique user/key index prevents concurrent duplicates. Repeating the same payload returns the original verification; changing the payload returns `IDEMPOTENCY_KEY_REUSED`.

Jobs carry job ID, verification ID, request ID, attempt, schema version, and creation time. Deterministic BullMQ job IDs and state checks make initialization safe to retry. Jobs use three exponential-backoff attempts and bounded completed/failed retention. Queue submission failures mark the verification failed and expose `VERIFICATION_QUEUE_UNAVAILABLE`.

## Events and SSE

Events live in a separate collection with a per-verification monotonic sequence. `GET /api/v1/verifications/:id/events?after=N` supports catch-up. The SSE endpoint first sends persisted events after the supplied sequence, then live in-process events and 15-second heartbeats.

Clients should reconnect with the last processed sequence in the `after` query. Persisted catch-up prevents event loss across API restarts. In-process fan-out serves clients connected to the same API instance; a Redis-backed cross-instance fan-out adapter is required before horizontally scaling the API.

## Lifecycle operations

- Cancellation records `cancelRequestedAt`, moves the record to `CANCELLED`, and emits a durable event.
- Retry is restricted to failed or cancelled records and creates a new deterministic job generation.
- Visibility supports `PRIVATE`, `UNLISTED`, and `PUBLIC`; public report exposure is deferred to the reports phase.
- Delete is a soft lifecycle delete and is rejected while processing is active.
