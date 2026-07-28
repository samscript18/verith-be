# Learning and Quizzes

## Publication workflow

Courses and lessons begin as `DRAFT`. Content editors and administrators can
move lessons through review and publication. A course cannot become
`PUBLISHED` until it contains at least one lesson and every attached lesson is
published. Public APIs query published records only.

Lesson HTML is sanitized before persistence using an explicit tag and
attribute allowlist. Scripts, styles, embedded media, event handlers,
protocol-relative links, and non-HTTPS link schemes are removed. Public output
returns only the stored sanitized HTML.

## Progress

Progress is unique per user and lesson. Updates are monotonic: an older client
cannot reduce recorded completion. The first update records `startedAt`;
reaching 100 records `completedAt`. Repeating completion preserves the original
completion state, so Phase 12 can attach one idempotent reward reference without
creating duplicate XP.

## Quizzes

Question definitions and correct option IDs are stored only in the protected
quiz document. Normal quiz-read endpoints construct an allowlisted projection
containing prompt and options but never correct answers or explanations.

Submissions:

1. require a published quiz;
2. enforce the configured maximum attempts;
3. require every question exactly once;
4. reject unknown question and option IDs;
5. compare normalized answer sets server-side;
6. persist score, pass state, selected answers, and explanations;
7. return explanations only after submission;
8. complete lesson progress on a passing score.

Concurrent attempts use a unique user/quiz/attempt-number index. A collision
returns an explicit conflict rather than double-counting an attempt.

Gamification is Phase 12. Passing attempts persist
`DEFERRED_TO_GAMIFICATION_PHASE`; no reward is fabricated or silently treated
as delivered.

## Recommendations

Report recommendation tags resolve only against published courses and only
after report ownership is verified. If no published catalog item matches, the
endpoint returns an empty list.
