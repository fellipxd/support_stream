'use client';

import { useActionState, useRef, useState } from 'react';
import { addCommentAction } from '@/app/actions/tickets';
import { Button, FormAlert, inputClass } from '@/components/ui/primitives';
import { acceptAttribute } from '@/server/attachments/validation';
import type { ActionResult } from '@/lib/errors';

type Visibility = 'PUBLIC' | 'INTERNAL' | 'QA_NOTE' | 'DEV_NOTE';

const OPTIONS: Array<{ value: Visibility; label: string; help: string }> = [
  {
    value: 'PUBLIC',
    label: 'Reply to reporter',
    help: 'The reporter will see this and be emailed.',
  },
  {
    value: 'INTERNAL',
    label: 'Internal note',
    help: 'Only staff can see this. The reporter is never told.',
  },
  {
    value: 'QA_NOTE',
    label: 'QA note',
    help: 'Internal. For reproduction and verification detail.',
  },
  { value: 'DEV_NOTE', label: 'Developer note', help: 'Internal. For technical findings.' },
];

const initial: ActionResult<{ id: string }> = { ok: false, error: '', code: '' };

/**
 * Comment composer. The visibility choice is explicit and visually loud — accidentally
 * exposing an internal note to a reporter is the failure mode this design guards against
 * (§19 of the brief).
 */
export function CommentForm({
  ticketId,
  canWriteInternal,
}: {
  ticketId: string;
  canWriteInternal: boolean;
}) {
  const [state, formAction, pending] = useActionState(addCommentAction, initial);
  const [visibility, setVisibility] = useState<Visibility>('PUBLIC');
  const formRef = useRef<HTMLFormElement>(null);

  if (state.ok && formRef.current) formRef.current.reset();

  const isInternal = visibility !== 'PUBLIC';
  const selected = OPTIONS.find((o) => o.value === visibility);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="visibility" value={visibility} />

      {!state.ok && state.error ? <FormAlert message={state.error} /> : null}

      {canWriteInternal ? (
        <fieldset>
          <legend className="sr-only">Who can see this comment</legend>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Comment visibility">
            {OPTIONS.map((option) => {
              const active = option.value === visibility;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setVisibility(option.value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors ${
                    active
                      ? option.value === 'PUBLIC'
                        ? 'bg-brand-600 text-white ring-brand-600'
                        : 'bg-amber-500 text-white ring-amber-500'
                      : 'bg-white text-ink-600 ring-ink-300 hover:bg-ink-50'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p
            className={`mt-1.5 text-xs ${isInternal ? 'font-medium text-amber-700' : 'text-ink-500'}`}
          >
            {selected?.help}
          </p>
        </fieldset>
      ) : null}

      <div className={isInternal ? 'rounded-xl bg-amber-50 p-2 ring-1 ring-amber-300' : ''}>
        <label htmlFor="comment-body" className="sr-only">
          {isInternal ? 'Internal note' : 'Your comment'}
        </label>
        <textarea
          id="comment-body"
          name="body"
          rows={4}
          required
          maxLength={10000}
          placeholder={
            isInternal ? 'Internal note — the reporter will never see this…' : 'Write a reply…'
          }
          className={inputClass}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <label htmlFor="comment-attachments" className="sr-only">
            Attach files
          </label>
          <input
            id="comment-attachments"
            name="attachments"
            type="file"
            multiple
            accept={acceptAttribute()}
            className="block max-w-full text-xs text-ink-600 file:mr-2 file:rounded-lg file:border-0 file:bg-ink-100 file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-ink-700 hover:file:bg-ink-200"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Sending…' : isInternal ? 'Add internal note' : 'Send reply'}
        </Button>
      </div>
      <p className="text-xs text-ink-500">
        Markdown is supported: **bold**, *italic*, `code`, - lists, [links](https://…).
      </p>
    </form>
  );
}
