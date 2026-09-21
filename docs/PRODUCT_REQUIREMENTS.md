# Support Portal — Product Requirements

## 1. Problem statement

Issues affecting the organisation's web portals are currently reported over WhatsApp, email,
informal chat, spreadsheets and verbally. Consequences: reports are lost, duplicated,
forgotten, poorly documented and impossible to measure. There is no single source of truth
and no way to answer "how many payment issues did the Guardian Portal have last month?".

## 2. Product goal

One centralised Support Portal that owns the **complete issue lifecycle** — from an
anonymous customer report to verified resolution and management reporting.

**Success condition:** at the end of Phase 1 the organisation can stop accepting support
issues through WhatsApp/email and point every reporter at the portal.

## 3. Personas

| Persona         | Needs                                                                                                              | Key friction to remove                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Guest reporter  | Report a problem in < 2 minutes, from a phone, without an account. Know it was received. Be told when it is fixed. | Account creation, unclear forms, silence after reporting |
| Registered user | Everything a guest has, plus history and a dashboard                                                               | Re-typing their details, losing the ticket link          |
| Support agent   | A queue to work, triage tools, ability to ask for information, routing                                             | Reports arriving in five different inboxes               |
| QA              | Reproduce, document, verify fixes                                                                                  | No reproduction steps, no attachments                    |
| Developer       | Clear reproduction and priority; a place to say "ready for QA"                                                     | Being pinged in chat with no context                     |
| Support/QA lead | Workload, backlog, SLA breaches, escalation                                                                        | No numbers                                               |
| HOD / Admin     | KPIs, trends, portal reliability, configuration without deployments                                                | Spreadsheets                                             |

## 4. Core user journeys

1. **Guest report** — landing page → report form (portal, category, title, description, what
   they tried / happened / expected, frequency, attachments) → ticket ID + acknowledgement
   email with a secure magic link → guest opens ticket, comments, adds attachments, sees
   status → resolution email → optional confirmation.
2. **Registered report** — same form pre-filled; ticket appears on the user's dashboard.
3. **Triage** — untriaged queue → set portal/category/severity/priority → routing assigns
   project, support queue and QA team → assign support owner and QA owner.
4. **Investigation** — QA reproduces, adds internal/QA notes and attachments, requests
   information from the reporter (ticket → `WAITING_FOR_USER`), assigns a developer.
5. **Development** — developer works, posts a developer note, marks `READY_FOR_QA`.
6. **Verification** — QA moves to `QA_VERIFICATION`, verifies, resolves. Reporter is emailed.
7. **Closure** — auto-close after the configured grace period, or reporter/staff closes.
   Reopen is permitted inside the reopen window.
8. **Management** — KPI dashboard, trends, SLA compliance, aging, exports.

## 5. Functional requirements (MVP = Phase 1)

- **FR-1** Guests submit tickets without an account; CAPTCHA/rate limits protect the endpoint.
- **FR-2** Every ticket gets an immutable, human-readable key (`SUP-000001`, or a per-project
  prefix such as `PAY-000231`) plus an internal UUID.
- **FR-3** Acknowledgement email contains the key and a secure, high-entropy, expiring
  access link. Ticket ID alone never grants access.
- **FR-4** Portals, projects, categories, teams, priorities, severities, SLAs and routing
  rules are database-configurable by administrators — no code deployment.
- **FR-5** Ticket state changes obey a server-enforced state machine with per-role transition
  permissions.
- **FR-6** Comments have explicit visibility: `PUBLIC`, `INTERNAL`, `QA_NOTE`, `DEV_NOTE`,
  `SYSTEM`. Non-public content is never sent to a reporter, by API or by email.
- **FR-7** Attachments are validated (MIME, size, count), stored outside the web root and
  served only through short-lived signed URLs after an authorisation check.
- **FR-8** Every mutation writes an immutable activity/audit record: actor, timestamp,
  action, old value, new value.
- **FR-9** Notifications: email (queued, retried) and in-app notification centre with unread
  counts.
- **FR-10** Search and filtering over ticket key, title, description, reporter, portal,
  assignee, category, status, priority, severity, date, SLA state — server-side paginated.
- **FR-11** RBAC enforced server-side on every read and write. The UI only reflects it.

Phase 2–4 requirements are listed in `IMPLEMENTATION_PLAN.md`.

## 6. Non-functional requirements

| Area           | Requirement                                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| Performance    | Ticket list p95 < 400 ms at 100k tickets; all list endpoints paginated and index-backed; no unbounded client fetches  |
| Security       | See `SECURITY_MODEL.md`. OWASP Top 10 addressed; no IDOR; no enumeration                                              |
| Availability   | Stateless app servers; jobs retried with backoff; email failure never blocks ticket creation                          |
| Accessibility  | WCAG 2.1 AA: semantic markup, labelled fields, visible focus, keyboard-operable, AA contrast, errors linked to inputs |
| Responsiveness | Full function at 360 px; reporting flow designed mobile-first                                                         |
| Observability  | Structured JSON logs with request id; no secrets or tokens logged                                                     |
| Data retention | Configurable per-entity retention; guest tokens expire; attachments have a retention policy                           |
| i18n readiness | All copy centralised; no hard-coded strings in domain logic                                                           |

## 7. Measurable outcomes

- 100 % of new support issues have a ticket key within 30 days of launch.
- First-response SLA compliance reported weekly.
- Reopen rate < 10 %.
- Median time-to-resolution trend visible per portal and per category.

## 8. Explicit non-goals (MVP)

Live chat, telephony, customer knowledge base, AI classification, multi-tenant white
labelling, mobile native apps. Phase 4 evaluates AI _assistance_ only — never silent control
of workflow decisions.

## 9. Recorded assumptions

Decisions taken without a stakeholder present (non-blocking per §49 of the brief):

| #   | Assumption                                                                                                                            | Rationale                                                | Reversible?                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------- |
| A1  | Single organisation (single tenant), org row exists for future multi-tenancy                                                          | No multi-tenant requirement stated                       | Yes — org id already on the key tables |
| A2  | Ticket keys are global `SUP-` by default; per-project prefixes configurable per project                                               | Simplest thing that satisfies both examples in the brief | Yes                                    |
| A3  | Guest access = emailed magic link → exchanged for a short-lived, ticket-scoped session cookie                                         | URL tokens leak via referrer/history/logs                | Yes                                    |
| A4  | Password auth with an OIDC-ready adapter boundary; SSO deferred until the IdP is named                                                | Cannot implement SSO against an unnamed IdP              | Yes — `AuthProvider` interface         |
| A5  | Email via SMTP (nodemailer) behind a `Mailer` interface; console driver for dev                                                       | Provider-neutral                                         | Yes                                    |
| A6  | Jobs run in a Postgres-backed queue with `SKIP LOCKED`, not Redis/BullMQ                                                              | Avoids a second datastore at this scale                  | Yes — `JobQueue` interface             |
| A7  | Files on a local/volume driver behind a `Storage` interface; S3 driver is a drop-in                                                   | Deployment target not specified                          | Yes                                    |
| A8  | Business hours 08:00–17:00 Mon–Fri, org timezone `Africa/Lagos`, configurable                                                         | SLA needs a default                                      | Yes — DB configuration                 |
| A9  | Auto-close 7 days after `RESOLVED`; reopen allowed within 14 days of closure                                                          | Common support default                                   | Yes — DB configuration                 |
| A10 | Virus scanning is designed and gated (`attachment.scanStatus`) but the scanner driver is a no-op stub until ClamAV/provider is chosen | No scanner available in the target environment yet       | Yes                                    |
