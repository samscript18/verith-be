# Evidence

Evidence is a retrieved source record associated with one extracted claim. A
search result is only discovery input. The search snippet is stored under
metadata for auditability with `searchSnippetIsEvidence: false`; it cannot
populate `relevantExcerpt`.

## Retrieval and access

Every candidate page passes through the same DNS-revalidating, address-pinned
safe-fetch service used for submitted URLs. Available and partially available
records contain an excerpt selected from retrieved text plus its SHA-256
content hash. Failed retrievals contain no excerpt and retain one of:
`NOT_FOUND`, `BLOCKED`, `TIMEOUT`, `UNSAFE_URL`, `UNSUPPORTED`, or
`FETCH_FAILED`.

The service does not bypass paywalls, authentication, robots controls, or
network policy. Provider snippets cannot replace inaccessible content.

## Ranking and source uncertainty

Ranking combines the provider relevance signal, lexical claim/excerpt overlap,
source authority category, and publication recency. These are deterministic
retrieval signals, not truth confidence. Government domains may be categorized
`HIGH`, educational domains `MODERATE`, and unfamiliar domains `UNKNOWN`;
unfamiliar sources are never automatically labelled low credibility.

Phase 7 assigns `INCONCLUSIVE` to every claim relationship. `SUPPORTS`,
`CONTRADICTS`, `PROVIDES_CONTEXT`, and `MENTIONS_ONLY` are reserved for the
evidence-comparison phase.

## Lineage

Canonical URLs remove fragments and common tracking parameters. Records with
the same canonical URL or retrieved-content hash are marked `DUPLICATE`.
Publisher/title/date similarity marks a `SYNDICATED_CANDIDATE`. Both reference
the earlier record through `duplicateOfEvidenceId`; the original remains
`UNIQUE`.
