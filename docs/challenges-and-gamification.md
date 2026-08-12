# Challenges and Gamification

## Challenge lifecycle

Content editors and administrators create challenges through protected admin
routes. A future `publishAt` creates a `SCHEDULED` challenge. Reads and attempts
atomically promote eligible scheduled records and expire elapsed records, so an
unavailable challenge cannot be scored.

Normal challenge responses omit `correctOptionIds` and explanations. Answers are
validated and scored from the protected database document. Explanations are
returned only after the attempt is recorded. Attempt numbers have a compound
unique index to reject concurrent duplicates.

## Hybrid Daily Practice generation

Daily Practice is created on scheduler startup and hourly at minute 15. The
first operation checks `daily-media-literacy-YYYY-MM-DD`; an existing record
causes an immediate return without provider health checks or AI usage. A new
challenge still requires an active Super Admin owner.

For a missing date, the server deterministically selects two topics and ten
competency slots. It then requests one ten-question structured response through
the `DAILY_CHALLENGE_GENERATION` capability. Candidate order comes from the
existing provider configuration and capability support. The request permits at
most two provider calls and never makes one call per question.

Before storage, `DailyChallengeValidator` enforces question count, supported
type, option and answer integrity, topics, competencies, explanations, learning
objectives, scenario quality, opening diversity, and local safety rules. Recent
duplication uses normalized SHA-256 prompt signatures plus token Jaccard
similarity over a configurable 90-day window. It does not use Redis, embeddings,
or another provider call.

If AI is disabled or both bounded attempts are unusable, the expanded
deterministic challenge bank emits the same normalized internal structure and
passes through the same validator. Daily Practice therefore remains available
when all provider keys or quotas are unavailable.

Server-owned policy remains ten Beginner questions, a 70% pass mark, two
attempts, 30 XP, 12 Truth Points, and 24-hour availability. Question IDs and the
date slug are assigned by the server. Correct answers and explanations remain
hidden until an attempt is scored.

The hybrid generator's low-cost operating policy is owned in code: AI-assisted
generation and automatic publication are enabled, duplicate checks cover the
latest 90 days at a 0.85 similarity threshold, and generation is limited to two
provider attempts before the deterministic bank takes over.

Admin records show generation mode, provider/model, versions, timestamp,
validation state, and topic/competency coverage. Existing records remain legacy
content and are not falsely rewritten as AI output.

## Reward integrity

`reward_transactions` is the append-only source of truth. Each user and
idempotency reference pair is unique. Quiz and challenge completion references
identify the underlying resource, so retries and later passing attempts cannot
award the same completion twice.

Gamification profiles are rebuildable caches. Profile reads recalculate XP,
Truth Points, levels, badge totals, and streaks from durable records. XP and
Truth Points are clamped to zero after reversals. Levels use:

```text
floor(sqrt(xp / 100)) + 1
```

Eligible activity creates at most one UTC streak record per day. Current streaks
remain active when the latest eligible date is today or yesterday.

## Badges and leaderboards

Badge ownership has a unique user/badge index. Badge reward transactions use the
badge identifier as their idempotency reference.

Weekly leaderboards begin Monday at 00:00 UTC; monthly boards begin on the first
day at 00:00 UTC. Rankings aggregate the ledger and exclude deleted or inactive
users and users whose `privacyPreferences.leaderboard` value is false.

## API

Public:

- `GET /api/v1/challenges`
- `GET /api/v1/challenges/today`
- `GET /api/v1/challenges/:slug`
- `GET /api/v1/gamification/badges`
- `GET /api/v1/gamification/leaderboards`

Authenticated:

- `POST /api/v1/challenges/:id/attempts`
- `GET /api/v1/challenges/:id/attempts`
- `GET /api/v1/gamification/me`
- `GET /api/v1/gamification/transactions`

Protected content/admin routes:

- `POST /api/v1/admin/challenges`
- `PATCH /api/v1/admin/challenges/:id/status`
- `POST /api/v1/admin/gamification/badges`
