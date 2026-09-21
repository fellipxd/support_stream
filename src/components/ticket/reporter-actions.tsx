'use client';

import { useActionState } from 'react';
import type { TicketStatus } from '@prisma/client';
import { transitionAction } from '@/app/actions/tickets';
import { Button, FormAlert } from '@/components/ui/primitives';
import type { ActionResult } from '@/lib/errors';

const initial: ActionResult<undefined> = { ok: false, error: '', code: '' };

/**
 * What a reporter (guest or registered) can do about a resolution: confirm it, or say the
 * problem is still there. Two plain choices, no status vocabulary.
 */
export function ReporterActions({ ticketId, status }: { ticketId: string; status: TicketStatus }) {
  const [state, action, pending] = useActionState(transitionAction, initial);

  if (status !== 'RESOLVED' && status !== 'CLOSED') return null;

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <h3 className="text-sm font-semibold text-emerald-900">
        {status === 'RESOLVED' ? 'Is this sorted?' : 'This ticket is closed'}
      </h3>
      <p className="mt-1 text-sm text-emerald-800">
        {status === 'RESOLVED'
          ? 'We believe this issue is fixed. Let us know if it is working now, or if you are still having trouble.'
          : 'If the problem comes back, you can reopen this ticket.'}
      </p>
      {!state.ok && state.error ? (
        <div className="mt-3">
          <FormAlert message={state.error} />
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {status === 'RESOLVED' ? (
          <form action={action}>
            <input type="hidden" name="ticketId" value={ticketId} />
            <input type="hidden" name="to" value="CLOSED" />
            <Button type="submit" size="sm" disabled={pending}>
              Yes, it is working
            </Button>
          </form>
        ) : null}
        <form action={action}>
          <input type="hidden" name="ticketId" value={ticketId} />
          <input type="hidden" name="to" value="REOPENED" />
          <input
            type="hidden"
            name="note"
            value="The reporter says the problem is still happening."
          />
          <Button type="submit" size="sm" variant="secondary" disabled={pending}>
            No, it is still happening
          </Button>
        </form>
      </div>
    </div>
  );
}
