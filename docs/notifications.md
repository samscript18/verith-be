# Notifications

Verith persists in-app notifications before attempting external delivery.
Creation is idempotent per user and event reference. User APIs use owner-scoped
queries, soft deletion, and cursor pagination.

Email delivery runs through the `notifications` BullMQ queue with five
exponentially backed-off attempts. The real SMTP adapter records `SENT`,
`FAILED`, or `NOT_CONFIGURED`; an unavailable provider is never reported as a
successful delivery. Provider message identifiers and safe failure codes remain
internal.

Dispatch reads preferences at send time. Verification, learning, challenge,
streak, and gamification messages may be disabled. `emailEnabled` controls the
email channel. Security alerts are essential and remain eligible even when the
stored `security` or email preference is false.

Implemented owner endpoints:

- `GET /api/v1/notifications`
- `PATCH /api/v1/notifications/:id/read`
- `PATCH /api/v1/notifications/read-all`
- `DELETE /api/v1/notifications/:id`

Verification completion and failure events create retry-safe notifications.
Push is not presented as an implemented notification channel.
