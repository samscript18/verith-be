# Verification Pipeline

The verification pipeline is scheduled for Phases 4–10 and is not implemented in the foundation. It will create a verification record immediately, persist monotonic stage events, enqueue idempotent jobs, route only to configured real providers, synthesize a report from stored evidence, and validate every citation before completion.

Unavailable stages will be recorded as `UNAVAILABLE` or `SKIPPED`; they will never be represented as successful analysis.
