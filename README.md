# Support Portal

The organisation's single source of truth for the complete issue lifecycle — from a customer's
first report to verified resolution and management reporting. It replaces issue reporting over
WhatsApp, email, informal chat and spreadsheets.

Built with Next.js 15 (App Router), TypeScript, PostgreSQL and Prisma as a modular monolith.

---

## What it does

| Area                 | Capability                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Reporting**        | Guests report without an account; registered users get a dashboard and history                                                  |
| **Identity**         | Every ticket gets an immutable, human-readable key (`SUP-000251`, or a project prefix such as `PAY-000231`)                     |
| **Guest access**     | Emailed magic link, exchanged once for a ticket-scoped session — a ticket ID alone never grants access                          |
| **Lifecycle**        | A server-enforced state machine: NEW → TRIAGE → ASSIGNED → IN_PROGRESS → … → RESOLVED → CLOSED, with reopen and exception paths |
| **Triage & routing** | Portal, category, severity and priority drive configurable deterministic routing to a project and teams                         |
| **Collaboration**    | Public comments, internal notes, QA notes and developer notes, with visibility enforced in SQL                                  |
| **Attachments**      | MIME + extension + magic-byte validation, private storage, short-lived signed download URLs                                     |
| **Notifications**    | One dispatch point: in-app notification centre plus queued, retried email with nine templates                                   |
| **History**          | Immutable per-ticket activity trail and an append-only organisation-wide audit log                                              |
| **SLA**              | Per-severity first-response and resolution targets, business hours, pause while waiting on the reporter                         |
| **Reporting**        | Volume, resolution times, SLA compliance, reopen rate, backlog, aging and distributions                                         |

---

## Quick start

```bash
# 1. Dependencies
npm install

# 2. Configuration
cp .env.example .env          # then set DATABASE_URL and the two secrets

# 3. Database
npx prisma migrate deploy
npm run db:seed               # portals, categories, teams, SLA policies, one user per role

# 4. Run — the app, and the worker that sends email
npm run dev
npm run worker                # in a second terminal
```

Open http://localhost:3000. Sign in with any seeded account, password `Passw0rd!demo`:

| Account               | Role                        |
| --------------------- | --------------------------- |
| `user@example.com`    | Registered reporter         |
| `support@example.com` | Support agent               |
| `qa@example.com`      | QA                          |
| `dev@example.com`     | Developer                   |
| `hod@example.com`     | Management (reports, audit) |
| `admin@example.com`   | Administrator               |

With `MAIL_DRIVER=console` (the default) outgoing mail is logged rather than sent, and every
delivery is recorded in the `EmailDelivery` table.

---

## Documentation

Read these before changing anything structural.

| Document                                                                 | Covers                                                                                        |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| [`docs/PRODUCT_REQUIREMENTS.md`](docs/PRODUCT_REQUIREMENTS.md)           | Problem, personas, journeys, functional and non-functional requirements, recorded assumptions |
| [`docs/SYSTEM_ARCHITECTURE.md`](docs/SYSTEM_ARCHITECTURE.md)             | Shape, technology choices and why, module boundaries, failure behaviour                       |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md)                               | Entities, relationships, indexing strategy, integrity rules                                   |
| [`docs/RBAC.md`](docs/RBAC.md)                                           | Roles and the complete permission matrix                                                      |
| [`docs/TICKET_LIFECYCLE.md`](docs/TICKET_LIFECYCLE.md)                   | The state machine, transition permissions and guards                                          |
| [`docs/NOTIFICATION_ARCHITECTURE.md`](docs/NOTIFICATION_ARCHITECTURE.md) | Events, recipients, hard rules, templates, delivery and retry                                 |
| [`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md)                       | Trust boundaries and the threat analysis with mitigations                                     |
| [`docs/TEST_STRATEGY.md`](docs/TEST_STRATEGY.md)                         | What is tested where, and why                                                                 |
| [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md)             | Phase 1 scope (delivered) and phases 2–4                                                      |

---

## Repository layout

```
src/
  app/          routes and UI only — no business rules
    (public)/   landing, report form, guest entry points
    (auth)/     sign in, register
    (app)/      dashboard, queue, tickets, reports, administration
    api/        attachments, job runner, health
    actions/    server actions (validate → delegate)
  components/   presentational components and small client islands
  server/       the domain — see docs/SYSTEM_ARCHITECTURE.md §3
    authz/      the single source of truth for permissions
    tickets/    ticket service, lifecycle state machine, key allocation
    routing/    deterministic routing engine
    sla/        deadline and breach arithmetic
    notifications/  dispatch, templates, mailer boundary
    attachments/    validation, storage drivers, URL signing
    audit/      activity and audit writers
    jobs/       queue, handlers, worker
  lib/          framework-free helpers
prisma/         schema, migrations, seed
tests/          unit, integration, e2e
```

Two rules keep the boundaries honest: `app/` never touches Prisma directly, and authorisation
exists only in `server/authz`.

---

## Testing

```bash
npm run test:unit          # domain logic — fast, no database
npm run test:integration   # services against a real PostgreSQL
npm run test:e2e           # Playwright, including the acceptance scenario
npm run typecheck && npm run lint
```

Integration tests expect a database at `support_stream_test`; E2E resets and seeds
`support_stream_e2e` itself. Both are wired up in `.github/workflows/ci.yml`.

The E2E suite includes `acceptance.spec.ts`, which drives the §52 acceptance scenario end to
end: a guest reports a payment problem against the Guardian Portal, support triages it, QA is
assigned and investigates, a developer is assigned and marks the fix ready, QA verifies and
resolves, the reporter is emailed, and the ticket appears in the management dashboard.

---

## Deployment

```bash
docker compose up --build
```

`docker-compose.yml` runs three services: PostgreSQL, the application (which applies migrations
on start) and the worker. The worker scales independently of the web tier.

Without a long-running worker, drain the queue from a scheduler instead:

```bash
curl -X POST https://support.example.com/api/jobs/run \
  -H "Authorization: Bearer $JOB_RUNNER_SECRET"
```

`/api/health` reports database connectivity and queue depth for liveness and readiness probes.

### Production checklist

- [ ] `SESSION_SECRET` and `ATTACHMENT_SECRET` are 32+ random characters (the app refuses to
      start in production if a development placeholder remains)
- [ ] `APP_URL` is the public HTTPS URL — it is what appears in emailed ticket links
- [ ] `MAIL_DRIVER=smtp` with real credentials
- [ ] `CAPTCHA_PROVIDER=turnstile` with keys, for the public report form
- [ ] `STORAGE_DRIVER` points at durable storage, backed up with the database
- [ ] The application database role has no `UPDATE`/`DELETE` grant on `AuditLog` or
      `TicketActivity`
- [ ] The worker is running, and queue depth is monitored

---

## Configuration without deployments

Portals, projects, categories, teams, routing rules and SLA policies are database rows, not
code. Administrators change them at `/admin/portals`; the effect is immediate. Adding a portal
is a row, not a release.

## Extending

- **SSO/OIDC** — implement against the boundary in `src/server/auth/`; the `User.externalId`
  column is already there.
- **S3 storage** — implement `Storage` in `src/server/attachments/storage.ts`.
- **Another mail provider** — implement `Mailer` in `src/server/notifications/mailer.ts`.
- **Jira/GitHub/Zoho** — add an `IssueTrackerAdapter`; the ticket domain imports no vendor SDK.
- **AI assistance** (Phase 4) — the routing engine is a pure function, so a classifier can
  propose severity or category for a human to accept. No AI decision changes workflow silently.
