'use client';

import { useActionState, useState } from 'react';
import type { Priority, Severity, TicketStatus } from '@prisma/client';
import { assignAction, transitionAction, triageAction } from '@/app/actions/tickets';
import { Button, FormAlert, Label, inputClass } from '@/components/ui/primitives';
import { PRIORITY_LABEL, SEVERITY_HELP, SEVERITY_LABEL, STATUS_LABEL } from '@/lib/labels';
import type { ActionResult } from '@/lib/errors';

type Person = { id: string; name: string };

type Props = {
  ticketId: string;
  status: TicketStatus;
  severity: Severity;
  priority: Priority;
  categoryId: string | null;
  categories: Person[];
  availableTransitions: TicketStatus[];
  people: { support: Person[]; qa: Person[]; developers: Person[] };
  current: { supportOwnerId: string | null; qaOwnerId: string | null; developerId: string | null };
  permissions: { triage: boolean; assignSupport: boolean; assignQa: boolean; assignDev: boolean };
};

const initial: ActionResult<undefined> = { ok: false, error: '', code: '' };

/**
 * The staff workspace controls. Everything here is a convenience: the server re-checks each
 * permission and each transition, so a hidden control is not a security boundary.
 */
export function StaffPanel(props: Props) {
  const [triageState, triage, triagePending] = useActionState(triageAction, initial);
  const [assignState, assign, assignPending] = useActionState(assignAction, initial);
  const [transitionState, transition, transitionPending] = useActionState(
    transitionAction,
    initial,
  );
  const [targetStatus, setTargetStatus] = useState<TicketStatus | ''>('');

  const needsDuplicate = targetStatus === 'DUPLICATE';
  const needsNote = targetStatus === 'REJECTED' || targetStatus === 'RESOLVED';
  const error =
    (!triageState.ok && triageState.error) ||
    (!assignState.ok && assignState.error) ||
    (!transitionState.ok && transitionState.error) ||
    '';

  return (
    <div className="space-y-4">
      {error ? <FormAlert message={error} /> : null}

      {props.permissions.triage ? (
        <section className="rounded-xl border border-ink-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink-900">Triage</h3>
          <form action={triage} className="space-y-3">
            <input type="hidden" name="ticketId" value={props.ticketId} />
            <div>
              <Label htmlFor="triage-category">Category</Label>
              <select
                id="triage-category"
                name="categoryId"
                defaultValue={props.categoryId ?? ''}
                className={inputClass}
              >
                <option value="">Uncategorised</option>
                {props.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="triage-severity" hint="business impact">
                Severity
              </Label>
              <select
                id="triage-severity"
                name="severity"
                defaultValue={props.severity}
                className={inputClass}
              >
                {(Object.keys(SEVERITY_LABEL) as Severity[]).map((value) => (
                  <option key={value} value={value}>
                    {SEVERITY_LABEL[value]} — {SEVERITY_HELP[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="triage-priority" hint="how soon we act">
                Priority
              </Label>
              <select
                id="triage-priority"
                name="priority"
                defaultValue={props.priority}
                className={inputClass}
              >
                {(Object.keys(PRIORITY_LABEL) as Priority[]).map((value) => (
                  <option key={value} value={value}>
                    {PRIORITY_LABEL[value]}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" size="sm" disabled={triagePending} className="w-full">
              {triagePending ? 'Saving…' : 'Save triage'}
            </Button>
          </form>
        </section>
      ) : null}

      <section className="rounded-xl border border-ink-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink-900">Assignment</h3>
        <div className="space-y-3">
          {[
            {
              role: 'SUPPORT' as const,
              label: 'Support owner',
              people: props.people.support,
              current: props.current.supportOwnerId,
              allowed: props.permissions.assignSupport,
            },
            {
              role: 'QA' as const,
              label: 'QA owner',
              people: props.people.qa,
              current: props.current.qaOwnerId,
              allowed: props.permissions.assignQa,
            },
            {
              role: 'ENGINEERING' as const,
              label: 'Developer',
              people: props.people.developers,
              current: props.current.developerId,
              allowed: props.permissions.assignDev,
            },
          ]
            .filter((row) => row.allowed)
            .map((row) => (
              <form key={row.role} action={assign} className="flex items-end gap-2">
                <input type="hidden" name="ticketId" value={props.ticketId} />
                <input type="hidden" name="role" value={row.role} />
                <div className="flex-1">
                  <Label htmlFor={`assign-${row.role}`}>{row.label}</Label>
                  <select
                    id={`assign-${row.role}`}
                    name="assigneeId"
                    defaultValue={row.current ?? ''}
                    className={inputClass}
                  >
                    <option value="">Unassigned</option>
                    {row.people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit" size="sm" variant="secondary" disabled={assignPending}>
                  Set
                </Button>
              </form>
            ))}
        </div>
      </section>

      {props.availableTransitions.length > 0 ? (
        <section className="rounded-xl border border-ink-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink-900">Move this ticket</h3>
          <form action={transition} className="space-y-3">
            <input type="hidden" name="ticketId" value={props.ticketId} />
            <div>
              <Label htmlFor="transition-to">New status</Label>
              <select
                id="transition-to"
                name="to"
                required
                value={targetStatus}
                onChange={(event) => setTargetStatus(event.target.value as TicketStatus)}
                className={inputClass}
              >
                <option value="">Choose…</option>
                {props.availableTransitions.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABEL[status]}
                  </option>
                ))}
              </select>
            </div>
            {needsDuplicate ? (
              <div>
                <Label htmlFor="duplicate-key" required>
                  Duplicate of
                </Label>
                <input
                  id="duplicate-key"
                  name="duplicateOfKey"
                  placeholder="SUP-000123"
                  required
                  className={inputClass}
                />
              </div>
            ) : null}
            <div>
              <Label htmlFor="transition-note" required={needsNote}>
                {targetStatus === 'RESOLVED'
                  ? 'Resolution note (shared with the reporter)'
                  : 'Note'}
              </Label>
              <textarea
                id="transition-note"
                name="note"
                rows={3}
                required={needsNote}
                className={inputClass}
              />
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={transitionPending || !targetStatus}
              className="w-full"
            >
              {transitionPending ? 'Updating…' : 'Update status'}
            </Button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
