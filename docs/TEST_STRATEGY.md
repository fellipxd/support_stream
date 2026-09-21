# Test Strategy

Testing is a delivery requirement, not a follow-up. A capability is not done until its rules
are tested at the level where they are enforced.

## 1. Pyramid

| Level       | Tool                   | Scope                                                                                                                                                              | Runs                |
| ----------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| Unit        | Vitest                 | Pure domain logic: state machine, permission matrix, routing, SLA maths, ticket keys, notification recipient resolution, markdown sanitiser, attachment validation | every commit, < 5 s |
| Integration | Vitest + real Postgres | Services against the database: creation, triage, assignment, comments, attachments, guest tokens, authorisation, transactions, job enqueue                         | every commit        |
| E2E         | Playwright             | The acceptance scenario and the security negatives, through the real UI                                                                                            | CI, pre-release     |

## 2. Unit coverage (`tests/unit`)

- `lifecycle.test.ts` — every legal transition allowed; a representative set of illegal ones
  rejected (`NEW → RESOLVED`, `CLOSED → IN_PROGRESS`, terminal states); guards (missing
  developer for `READY_FOR_QA`, missing primary for `DUPLICATE`, reopen window expiry);
  idempotent self-transition.
- `authz.test.ts` — the matrix in `RBAC.md` asserted cell by cell, plus `own`/`asgn` scoping.
- `routing.test.ts` — most-specific rule wins; portal+category beats portal-only; fallback to
  the portal default project; inactive rules ignored.
- `sla.test.ts` — calendar vs business-hours deadlines, weekend rollover, pause/resume
  arithmetic, warning threshold, breach detection, met-on-time.
- `ticket-key.test.ts` — format, zero padding, per-project prefix, monotonicity, no collision
  under concurrent reservation (integration-backed).
- `notifications.test.ts` — recipient sets per event; actor excluded; deduplicated; internal
  comments never produce a reporter email; preferences honoured; transactional emails not
  suppressible.
- `sanitize.test.ts` — script tags, event handlers, `javascript:` URLs, and SVG payloads are
  stripped; legitimate markdown survives.
- `attachments.test.ts` — MIME allow-list, extension/magic-byte mismatch, size and count caps.

## 3. Integration coverage (`tests/integration`)

Each suite runs against a disposable schema and truncates between tests.

- `ticket-create.test.ts` — guest and registered creation; key allocation; activity row;
  SLA instance; acknowledgement job enqueued; guest token hashed not plaintext.
- `lifecycle.test.ts` — the full acceptance path through the service layer; activity trail
  complete and ordered; first response recorded once.
- `authorization.test.ts` — cross-user read denied (404); developer sees only assigned;
  guest scoped to one ticket; internal comments absent from reporter-visible payloads;
  illegal transition rejected at the service boundary.
- `guest-access.test.ts` — token exchange succeeds once; replay fails; expired fails; revoked
  fails; a token for ticket A cannot open ticket B; rate limit trips.
- `comments-attachments.test.ts` — visibility filtering; upload validation; signed URL
  required; oversized and disallowed types rejected.
- `transactions.test.ts` — a forced failure inside assignment leaves no ticket update, no
  activity, no notification, no job (the §41 guarantee).
- `reporting.test.ts` — KPI aggregates match hand-computed fixtures.

## 4. E2E coverage (`tests/e2e`, Playwright)

`acceptance.spec.ts` — the §52 scenario end to end:
guest reports with a screenshot → receives key and link → support triages (portal, category,
S2, P1) → QA assigned and notified → QA adds notes → developer assigned and notified →
developer marks ready for QA → QA verifies → `RESOLVED` → resolution email captured →
guest sees the resolution → admin KPI dashboard reflects the ticket.

`registered-user.spec.ts` — register/sign in, report, see it on the dashboard, comment,
receive an in-app notification.

`security.spec.ts` — the negative suite: unauthenticated access to a ticket redirects;
cross-user ticket URL returns not-found; a tampered guest token is rejected; an internal note
is invisible on the guest view and absent from the page source; an illegal transition is not
offered and is refused when forced; an unsupported file type and an oversized file are
rejected; the rate limiter trips on repeated guest submissions.

`a11y.spec.ts` — keyboard-only completion of the report form; focus visibility; labels and
error association; landmark structure.

## 5. Test data

`prisma/seed.ts` creates the organisation, portals (Customer, Business, Admin, Payment,
School, Guardian), categories, teams, SLA policies, routing rules and one user per role with
known credentials. E2E runs against the seed; integration tests build their own fixtures.

## 6. CI gates

`lint → typecheck → unit → integration (Postgres service) → build → E2E`.
A red gate blocks merge. Coverage is reported for `src/server/**`, where the rules live;
UI components are covered by E2E rather than by shallow render assertions.

## 7. Deliberate non-goals

No snapshot tests of large React trees (they break on whitespace and assert nothing about
behaviour). No mocking of Prisma in integration tests — a mocked database cannot prove a
transaction rolled back.
