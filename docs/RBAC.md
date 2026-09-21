# RBAC & Permission Matrix

Authorisation is **server-side only**. The UI hides what a user cannot do, but every server
action, route handler and service call re-checks. Hiding a button is not a control.

## 1. Roles

| Role            | Description                                                                    |
| --------------- | ------------------------------------------------------------------------------ |
| `GUEST`         | No account. Holds a ticket-scoped session obtained from an emailed magic link  |
| `USER`          | Registered reporter                                                            |
| `SUPPORT_AGENT` | Triages and owns tickets                                                       |
| `QA`            | Reproduces, verifies fixes                                                     |
| `DEVELOPER`     | Fixes assigned tickets                                                         |
| `SUPPORT_LEAD`  | Support agent + reassignment, escalation, merge, reopen, team views            |
| `QA_LEAD`       | QA + reassignment across QA, escalation                                        |
| `HOD`           | Read-only organisation-wide + all reports/exports                              |
| `ADMIN`         | Configuration (portals, projects, categories, teams, SLA, routing), user admin |
| `SUPER_ADMIN`   | Admin + role/permission administration + destructive actions                   |

Roles are additive: a user may hold several. The effective permission set is the union.

## 2. Permission matrix

`✓` allowed · `own` only their own tickets · `asgn` only tickets assigned to them ·
`—` denied.

| Permission                | GUEST    | USER     | SUPPORT_AGENT | QA  | DEVELOPER | SUPPORT_LEAD | QA_LEAD | HOD | ADMIN | SUPER_ADMIN |
| ------------------------- | -------- | -------- | ------------- | --- | --------- | ------------ | ------- | --- | ----- | ----------- |
| `ticket.create`           | ✓        | ✓        | ✓             | ✓   | ✓         | ✓            | ✓       | ✓   | ✓     | ✓           |
| `ticket.read.own`         | own      | own      | ✓             | ✓   | ✓         | ✓            | ✓       | ✓   | ✓     | ✓           |
| `ticket.read.any`         | —        | —        | ✓             | ✓   | asgn      | ✓            | ✓       | ✓   | ✓     | ✓           |
| `ticket.list.queue`       | —        | —        | ✓             | ✓   | asgn      | ✓            | ✓       | ✓   | ✓     | ✓           |
| `ticket.triage`           | —        | —        | ✓             | ✓   | —         | ✓            | ✓       | —   | ✓     | ✓           |
| `ticket.assign.support`   | —        | —        | ✓             | —   | —         | ✓            | —       | —   | ✓     | ✓           |
| `ticket.assign.qa`        | —        | —        | ✓             | ✓   | —         | ✓            | ✓       | —   | ✓     | ✓           |
| `ticket.assign.developer` | —        | —        | ✓             | ✓   | —         | ✓            | ✓       | —   | ✓     | ✓           |
| `ticket.reassign.any`     | —        | —        | —             | —   | —         | ✓            | ✓       | —   | ✓     | ✓           |
| `ticket.transition`       | limited¹ | limited¹ | ✓             | ✓   | asgn²     | ✓            | ✓       | —   | ✓     | ✓           |
| `ticket.resolve`          | —        | —        | ✓             | ✓   | —         | ✓            | ✓       | —   | ✓     | ✓           |
| `ticket.close`            | own³     | own³     | ✓             | ✓   | —         | ✓            | ✓       | —   | ✓     | ✓           |
| `ticket.reopen`           | own⁴     | own⁴     | ✓             | ✓   | —         | ✓            | ✓       | —   | ✓     | ✓           |
| `ticket.relate`           | —        | —        | ✓             | ✓   | —         | ✓            | ✓       | —   | ✓     | ✓           |
| `ticket.escalate`         | —        | —        | ✓             | ✓   | —         | ✓            | ✓       | —   | ✓     | ✓           |
| `comment.create.public`   | own      | own      | ✓             | ✓   | asgn      | ✓            | ✓       | ✓   | ✓     | ✓           |
| `comment.create.internal` | —        | —        | ✓             | ✓   | asgn      | ✓            | ✓       | —   | ✓     | ✓           |
| `comment.read.internal`   | —        | —        | ✓             | ✓   | asgn      | ✓            | ✓       | ✓   | ✓     | ✓           |
| `comment.edit.own`        | —        | ✓        | ✓             | ✓   | ✓         | ✓            | ✓       | ✓   | ✓     | ✓           |
| `attachment.upload`       | own      | own      | ✓             | ✓   | asgn      | ✓            | ✓       | —   | ✓     | ✓           |
| `attachment.download`     | own⁵     | own⁵     | ✓             | ✓   | asgn      | ✓            | ✓       | ✓   | ✓     | ✓           |
| `notification.read.own`   | —        | ✓        | ✓             | ✓   | ✓         | ✓            | ✓       | ✓   | ✓     | ✓           |
| `board.view`              | —        | —        | ✓             | ✓   | ✓         | ✓            | ✓       | ✓   | ✓     | ✓           |
| `report.view`             | —        | —        | ✓⁶            | ✓⁶  | —         | ✓            | ✓       | ✓   | ✓     | ✓           |
| `report.export`           | —        | —        | —             | —   | —         | ✓            | ✓       | ✓   | ✓     | ✓           |
| `config.portal.manage`    | —        | —        | —             | —   | —         | —            | —       | —   | ✓     | ✓           |
| `config.project.manage`   | —        | —        | —             | —   | —         | —            | —       | —   | ✓     | ✓           |
| `config.category.manage`  | —        | —        | —             | —   | —         | —            | —       | —   | ✓     | ✓           |
| `config.team.manage`      | —        | —        | —             | —   | —         | —            | —       | —   | ✓     | ✓           |
| `config.sla.manage`       | —        | —        | —             | —   | —         | —            | —       | —   | ✓     | ✓           |
| `config.routing.manage`   | —        | —        | —             | —   | —         | —            | —       | —   | ✓     | ✓           |
| `user.manage`             | —        | —        | —             | —   | —         | —            | —       | —   | ✓     | ✓           |
| `role.manage`             | —        | —        | —             | —   | —         | —            | —       | —   | —     | ✓           |
| `audit.read`              | —        | —        | —             | —   | —         | —            | —       | ✓   | ✓     | ✓           |
| `ticket.delete`           | —        | —        | —             | —   | —         | —            | —       | —   | —     | ✓           |

¹ Reporters may only move `RESOLVED → REOPENED` (inside the window) and
`RESOLVED → CLOSED` (confirming), and answer an information request
(`WAITING_FOR_USER → TRIAGE|IN_PROGRESS` happens automatically when they reply).
² Developers may only transition tickets where they are the assigned developer, and only
along `ASSIGNED|WAITING_FOR_DEVELOPER → IN_PROGRESS → READY_FOR_QA`.
³ Only from `RESOLVED`. ⁴ Only within the configured reopen window.
⁵ Only attachments on their own ticket with `visibility = PUBLIC`.
⁶ Agent/QA see team-scoped reports, not organisation-wide salary-sensitive comparisons.

## 3. Implementation

```ts
// src/server/authz/policy.ts — the only place these rules exist
can(actor, 'ticket.transition', ticket) → boolean
requirePermission(actor, permission, resource?) → throws ForbiddenError
```

- `actor` is a discriminated union: `{kind:'user', id, roles}` | `{kind:'guest', ticketId}` |
  `{kind:'system'}`. Roles are read from the database on every request; nothing role-related is
  ever taken from the cookie payload or the client.
- The matrix itself is versioned in code (`src/server/authz/permissions.ts`): a change to who
  may do what arrives as a reviewed diff with a failing test, not an unlogged row edit.
- Resource-scoped permissions (`own`, `asgn`) are resolved by `scopeFor(actor, permission)`
  which returns a Prisma `where` fragment, so **list** queries are filtered in SQL rather than
  fetched-then-filtered. This is what prevents IDOR at the list level.
- A guest actor is scoped to exactly one `ticketId`; every guest query carries that id.
- Denials throw `ForbiddenError`, which the error boundary maps to 403 without leaking whether
  the resource exists (404 semantics for reads: "not found" and "not yours" are the same reply).

## 4. Testing obligation

`tests/unit/authz.test.ts` asserts the complete matrix above cell-by-cell, and
`tests/integration/authorization.test.ts` proves the HTTP surface agrees with it, including
cross-user ticket access, internal-comment leakage and guest scope escape.
