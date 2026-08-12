# Event-Driven Architecture

Verith uses events at bounded-context boundaries and commands for work that has
one responsible processor.

## Delivery model

Domain events are written to `domain_event_outbox` before they are eligible for
delivery. The scheduler process claims pending records with a 30-second lease
and publishes typed envelopes through the application event bus.

Delivery is at least once:

- deterministic `deduplicationKey` values prevent duplicate outbox records;
- only one scheduler can hold a record lease at a time;
- failed handlers retry with exponential backoff;
- delivery stops after 10 attempts in `DEAD_LETTER`;
- successfully published records remain for 30 days for audit and then expire;
- event payloads contain identifiers, bounded enums, and safe failure codes,
  not submitted content, passwords, tokens, report bodies, or provider output.

Consumers must be idempotent. Notification creation uses the event ID as its
idempotency reference.

## Current domain events

| Event                         | Producer               | Consumers                 |
| ----------------------------- | ---------------------- | ------------------------- |
| `verification.completed.v1`   | Verification worker    | Notification              |
| `verification.failed.v1`      | Verification worker    | Notification              |
| `security.alert-requested.v1` | Authentication service | Notification              |

Copy such as notification titles and messages belongs to consumers. Producers
publish business facts only.

## Commands versus events

BullMQ queues remain command queues:

- a verification job has one verification orchestrator;
- a privacy job has one privacy worker;
- an email-delivery job has one notification worker.

The verification pipeline, report synthesis, authorization decisions, quiz
scoring, learning progress, and gamification rewards remain synchronous within
their use cases. Their callers require an immediate authoritative result, so
turning them into asynchronous events would introduce incorrect eventual
consistency.

## Process topology

API and worker processes persist outbox events. The scheduler process relays
them and therefore loads event consumers but not BullMQ workers. Production
must run at least one scheduler replica. Multiple scheduler replicas are safe
because claims use atomic MongoDB leases.

`PROCESS_ROLE=all` runs the relay for local development and tests.

## Failure semantics

A handler failure never changes a completed verification back to failed.
Handler failures stay attached to the outbox record and are retried. If the
outbox itself cannot be written after verification processing, the verification
lifecycle records `DOMAIN_EVENT_OUTBOX_UNAVAILABLE` without changing the core
report result.

Outbox insertion currently follows aggregate persistence rather than sharing a
MongoDB transaction with every producer write. The explicit unavailable event
and logs make that narrow failure window visible. A future change that groups a
specific aggregate mutation and outbox insertion must use a MongoDB replica-set
transaction rather than masking the gap.

## Versioning rules

Event names include their major contract version. Additive payload fields may
remain within the same version. Renaming, removing, or changing the meaning of
a field requires a new event name such as `.v2`; old consumers remain active
until pending `.v1` records have drained.
