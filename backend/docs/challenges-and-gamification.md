# Challenges and Gamification

## Challenge lifecycle

Content editors and administrators create challenges through protected admin
routes. A future `publishAt` creates a `SCHEDULED` challenge. Reads and attempts
atomically promote eligible scheduled records and expire elapsed records, so an
unavailable challenge cannot be scored.

Normal challenge responses omit `correctOptionIds` and explanations. Answers are
validated and scored from the protected database document. Explanations are
returned only after the attempt is persisted. Attempt numbers have a compound
unique index to reject concurrent duplicates.

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
