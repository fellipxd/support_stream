-- Full-text/trigram search support and integrity constraints (see docs/DATA_MODEL.md §3, §4)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Fast ILIKE / similarity search over the denormalised ticket search text.
CREATE INDEX IF NOT EXISTS "Ticket_searchText_trgm_idx" ON "Ticket" USING GIN ("searchText" gin_trgm_ops);

-- A ticket has exactly one reporter: a registered user XOR a guest.
ALTER TABLE "Ticket" DROP CONSTRAINT IF EXISTS "ticket_single_reporter";
ALTER TABLE "Ticket" ADD CONSTRAINT "ticket_single_reporter"
  CHECK (("reporterUserId" IS NULL) <> ("guestReporterId" IS NULL));

-- A relationship may not point at itself.
ALTER TABLE "TicketRelationship" DROP CONSTRAINT IF EXISTS "relationship_not_self";
ALTER TABLE "TicketRelationship" ADD CONSTRAINT "relationship_not_self"
  CHECK ("sourceTicketId" <> "targetTicketId");

-- Partial index for the job queue claim path (status = 'PENDING' only).
CREATE INDEX IF NOT EXISTS "Job_pending_runAt_idx" ON "Job" ("runAt") WHERE "status" = 'PENDING';
