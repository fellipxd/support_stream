# Implementation Plan

## Phase 1 — MVP foundation (this delivery)

| #   | Capability                                                                                        | Status |
| --- | ------------------------------------------------------------------------------------------------- | ------ |
| 1   | App foundation: Next.js 15 App Router, strict TS, Tailwind, lint/format, env validation           | ✅     |
| 2   | PostgreSQL + Prisma schema, migrations, seed                                                      | ✅     |
| 3   | Authentication: register, sign in/out, sessions, password hashing, rate limiting                  | ✅     |
| 4   | RBAC: permission matrix, policy service, SQL-level scoping                                        | ✅     |
| 5   | Portal/project/category/team registry (admin-configurable)                                        | ✅     |
| 6   | Guest reporting: public landing, mobile-first report form, attachments, CAPTCHA hook, rate limits | ✅     |
| 7   | Registered reporting + user dashboard (open/waiting/resolved/closed counts, history)              | ✅     |
| 8   | Ticket keys: gapless, per-project prefixes, immutable                                             | ✅     |
| 9   | Ticket list + filters + server-side pagination + full-text search                                 | ✅     |
| 10  | Ticket detail workspace: summary, description, attachments, conversation, timeline                | ✅     |
| 11  | Status lifecycle with server-enforced transitions and guards                                      | ✅     |
| 12  | Support triage + assignment (support/QA/developer) with routing                                   | ✅     |
| 13  | Comments with visibility classes and a safe renderer                                              | ✅     |
| 14  | Attachments: validation, private storage, signed download URLs                                    | ✅     |
| 15  | Notification subsystem: in-app centre + queued email with retries                                 | ✅     |
| 16  | Email templates (9) with ticket key, status and secure link                                       | ✅     |
| 17  | Ticket activity timeline + audit log                                                              | ✅     |
| 18  | Background job queue + worker + cron drain endpoint                                               | ✅     |
| 19  | Tests: unit, integration, Playwright E2E incl. security negatives                                 | ✅     |
| 20  | CI pipeline, Docker deployment, README/runbook                                                    | ✅     |

**Exit criterion:** the §52 acceptance scenario passes end to end. The organisation can switch
off WhatsApp/email intake.

## Phase 2 — Operational support

Configurable SLA policies with business hours and pause rules (engine shipped in Phase 1;
Phase 2 adds the admin UI, warning/breach sweeps and escalation chains); routing rule
administration UI; Kanban project boards with drag-to-transition; ticket relationships and
merge; duplicate suggestion at triage (deterministic: same portal + category + trigram title
similarity); support dashboards; team workload balancing; saved searches and advanced filters;
watchers.

## Phase 3 — Management & analytics

Full KPI dashboard (volume, resolution, SLA compliance, reopen rate, backlog, aging,
distribution by portal/category/severity/priority/agent/developer), trend charts, portal
reliability scorecards, release-correlation view, CSV/XLSX/PDF export behind
`report.export`, scheduled emailed reports.

## Phase 4 — Advanced automation (only after real ticket volume exists)

AI-assisted classification, duplicate suggestion by embedding similarity, severity
recommendation, ticket summarisation, draft support responses, knowledge-base suggestions,
recurring-incident detection. **Every AI output is a suggestion attributed to the model and
accepted by a human**; no AI decision silently changes status, priority, assignment or
customer-visible content. The boundary is `src/server/classification/` with a deterministic
implementation today.

## Repository structure

```
support-stream/
├── docs/                  # the nine specifications
├── prisma/                # schema, migrations, seed
├── src/
│   ├── app/               # routes: (public) (auth) (app) api
│   ├── components/        # UI + small client islands
│   ├── server/            # domain modules (see SYSTEM_ARCHITECTURE.md §3)
│   └── lib/               # framework-free helpers
├── tests/{unit,integration,e2e}
├── .github/workflows/ci.yml
├── Dockerfile / docker-compose.yml
└── README.md
```

## Sequencing rationale

Schema and authorisation come first because everything else depends on them; guest reporting
before staff tooling because an unreported issue has no lifecycle; notifications before
dashboards because the organisation's current pain is silence, not statistics.

## Definition of done (applied per capability)

requirements → UX → server logic → authorisation → validation → persistence → error paths →
audit/history → notifications → tests → documentation → validated.
