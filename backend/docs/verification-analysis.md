# Verification Analysis

Phase 8 separates model inference from deterministic decisions. The AI provider
receives only persisted claims, retrieved evidence excerpts, and normalized
submitted content. Its schema-constrained output may classify evidence
relationships and extract bounded textual findings. Every returned claim ID,
evidence ID, and text offset is checked against the verification before use.

The model does not output claim verdicts, overall verdicts, risk, or numeric
confidence.

## Claim confidence

`verification-analysis.v1` calculates claim confidence from:

- independent accessible non-duplicate source count;
- average source-authority signal;
- average evidence directness;
- source agreement;
- recency;
- presence of a primary/official source;
- successful structured-output validation.

The normalized factors and final weighted score are persisted on each claim
evaluation. Duplicate and syndicated evidence does not increase independent
source count. Low confidence resolves to `INSUFFICIENT_EVIDENCE` instead of
forcing a directional verdict.

## Verdict and risk

Claim verdicts are derived from validated supporting, contradicting, and
context relationships. Pure opinions, predictions, and value judgments are
`UNVERIFIABLE`.

The overall verdict is calculated from importance-weighted claim verdicts.
Risk additionally considers adverse high-importance claims and high-severity
manipulation or missing-context findings. When every claim is unverifiable or
insufficiently evidenced, the overall verdict is
`INSUFFICIENT_EVIDENCE` and risk is `UNKNOWN`.

These calculations are retrieval-time assessments, not declarations of
absolute truth.

## Text and context findings

Manipulation findings require an exact phrase and valid offsets. Finding
confidence is assigned by offset validation. Bias scores describe the submitted
item only; confidence depends on whether the cited phrases occur in the content.
Missing-context references must map to persisted evidence.

Source assessments apply to retrieved material and available metadata.
Government and educational domain signals may support stronger classifications.
An unfamiliar accessible publisher remains `UNKNOWN`; it is never
automatically classified as low credibility.
