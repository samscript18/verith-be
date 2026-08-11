# Reports

## Synthesis and validation

Reports are versioned snapshots of recorded verification data. Verdict, risk,
confidence, claim relationships, evidence citations, analysis findings, media
states, and methodology versions are copied from validated Phase 8/9 records.
The report layer does not ask a model to recalculate them.

Before completion, `report.v1` validates:

- every claim ID belongs to the verification;
- every cited evidence ID exists and belongs to a known claim;
- evidence source URLs are valid HTTP(S) URLs;
- confidence is within range;
- required limitations and methodology versions exist;
- the report schema version is current.

An invalid report is stored as `INVALID`, the verification is not completed,
and a safe validation error is recorded. A new successful version supersedes
the previous complete version. Verification completion occurs only after the
report reaches `COMPLETE`.

## Sharing and privacy

Reports default to `PRIVATE`. `UNLISTED` and `PUBLIC` reports receive a
192-bit random base64url slug. Revocation removes the slug, records the
revocation time, changes the report status, and makes the old URL return
not-found.

The public projection excludes user and verification ownership, provider
summary, prompt versions, internal IDs, operational records, private media
URLs, asset identifiers, and full audio transcripts/segments. It exposes only
public-safe report content and source links.

## Exports

Owner-authorized JSON and PDF exports use the same public-safe projection.
JSON is generated as actual UTF-8 JSON. PDFKit generates a real PDF containing
Verith branding, date/version, verdict, confidence, claims, evidence links,
missing context, manipulation findings, recommended actions, and limitations.

Each attempt creates an export record with format, state, byte count,
SHA-256 content hash, expiry, completion time, or safe failure code. Current
exports are generated synchronously; a later queue worker can take over large
exports without changing the record contract.

## Feedback and learning recommendations

Authenticated owners can submit or replace one feedback record per report.
Problem reports require a supported category and begin in `OPEN`.

Learning recommendations are honest tag-level suggestions until the Phase 11
catalog is available. They use `lessonId: null` and
`CATALOG_MATCH_PENDING`; no lesson is fabricated.
