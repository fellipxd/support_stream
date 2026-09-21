'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { reportIssueAction, type ReportResult } from '@/app/actions/tickets';
import { Button, FieldError, FormAlert, Label, inputClass } from '@/components/ui/primitives';
import { acceptAttribute } from '@/server/attachments/validation';

type PortalOption = { id: string; name: string; categories: { id: string; name: string }[] };

type Props = {
  portals: PortalOption[];
  reporter?: { name: string; email: string } | null;
  maxAttachmentMb: number;
  maxAttachments: number;
};

const initial: ReportResult = { ok: false, error: '', code: '' };

/**
 * Guest-first reporting form. Mobile-first, one column, progressive disclosure for the
 * optional technical detail, and every field labelled and error-linked for screen readers.
 */
export function ReportForm({ portals, reporter, maxAttachmentMb, maxAttachments }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(reportIssueAction, initial);
  const [portalId, setPortalId] = useState('');
  const [showTechnical, setShowTechnical] = useState(false);
  const [environment, setEnvironment] = useState({ browser: '', os: '', device: '', pageUrl: '' });

  // Safe, non-identifying environment detail, captured so reporters do not have to describe it.
  useEffect(() => {
    const ua = navigator.userAgent;
    const browser = /edg\//i.test(ua)
      ? 'Edge'
      : /chrome|crios/i.test(ua)
        ? 'Chrome'
        : /firefox|fxios/i.test(ua)
          ? 'Firefox'
          : /safari/i.test(ua)
            ? 'Safari'
            : 'Other';
    const os = /windows/i.test(ua)
      ? 'Windows'
      : /android/i.test(ua)
        ? 'Android'
        : /iphone|ipad|ipod/i.test(ua)
          ? 'iOS'
          : /mac os/i.test(ua)
            ? 'macOS'
            : /linux/i.test(ua)
              ? 'Linux'
              : 'Other';
    const device = /mobile/i.test(ua) ? 'Mobile' : /tablet|ipad/i.test(ua) ? 'Tablet' : 'Desktop';
    setEnvironment({ browser: `${browser} (${ua.slice(0, 120)})`, os, device, pageUrl: '' });
  }, []);

  useEffect(() => {
    if (state.ok) {
      const params = new URLSearchParams({ key: state.data.key });
      if (state.data.guestToken) params.set('token', state.data.guestToken);
      router.push(`/report/submitted?${params.toString()}`);
    }
  }, [state, router]);

  const categories = portals.find((p) => p.id === portalId)?.categories ?? [];
  const errors = state.ok ? undefined : state.fieldErrors;

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {!state.ok && state.error ? <FormAlert message={state.error} /> : null}

      {!reporter && (
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-ink-900">About you</legend>
          <div>
            <Label htmlFor="reporterName" required>
              Your name
            </Label>
            <input
              id="reporterName"
              name="reporterName"
              autoComplete="name"
              required
              aria-describedby={errors?.reporterName ? 'reporterName-error' : undefined}
              aria-invalid={errors?.reporterName ? true : undefined}
              className={inputClass}
            />
            <FieldError id="reporterName-error" errors={errors?.reporterName} />
          </div>
          <div>
            <Label htmlFor="reporterEmail" hint="we send updates here" required>
              Email address
            </Label>
            <input
              id="reporterEmail"
              name="reporterEmail"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              aria-describedby={errors?.reporterEmail ? 'reporterEmail-error' : undefined}
              aria-invalid={errors?.reporterEmail ? true : undefined}
              className={inputClass}
            />
            <FieldError id="reporterEmail-error" errors={errors?.reporterEmail} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="reporterPhone" hint="optional">
                Phone
              </Label>
              <input
                id="reporterPhone"
                name="reporterPhone"
                type="tel"
                autoComplete="tel"
                className={inputClass}
              />
            </div>
            <div>
              <Label htmlFor="reporterOrganization" hint="optional">
                Organisation
              </Label>
              <input
                id="reporterOrganization"
                name="reporterOrganization"
                autoComplete="organization"
                className={inputClass}
              />
            </div>
          </div>
        </fieldset>
      )}

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink-900">The issue</legend>

        <div>
          <Label htmlFor="portalId" required>
            Which portal or product?
          </Label>
          <select
            id="portalId"
            name="portalId"
            required
            value={portalId}
            onChange={(e) => setPortalId(e.target.value)}
            aria-describedby={errors?.portalId ? 'portalId-error' : undefined}
            aria-invalid={errors?.portalId ? true : undefined}
            className={inputClass}
          >
            <option value="">Select a portal…</option>
            {portals.map((portal) => (
              <option key={portal.id} value={portal.id}>
                {portal.name}
              </option>
            ))}
          </select>
          <FieldError id="portalId-error" errors={errors?.portalId} />
        </div>

        <div>
          <Label htmlFor="categoryId" hint={portalId ? undefined : 'choose a portal first'}>
            What is it about?
          </Label>
          <select id="categoryId" name="categoryId" disabled={!portalId} className={inputClass}>
            <option value="">Not sure</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="title" hint="a short summary" required>
            What is the problem?
          </Label>
          <input
            id="title"
            name="title"
            required
            minLength={5}
            maxLength={160}
            placeholder="e.g. I cannot make payment for my ward"
            aria-describedby={errors?.title ? 'title-error' : undefined}
            aria-invalid={errors?.title ? true : undefined}
            className={inputClass}
          />
          <FieldError id="title-error" errors={errors?.title} />
        </div>

        <div>
          <Label htmlFor="description" required>
            Tell us what happened
          </Label>
          <textarea
            id="description"
            name="description"
            required
            rows={5}
            minLength={10}
            placeholder="Describe the problem in your own words."
            aria-describedby={errors?.description ? 'description-error' : undefined}
            aria-invalid={errors?.description ? true : undefined}
            className={inputClass}
          />
          <FieldError id="description-error" errors={errors?.description} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="whatTrying">What were you trying to do?</Label>
            <textarea id="whatTrying" name="whatTrying" rows={2} className={inputClass} />
          </div>
          <div>
            <Label htmlFor="whatExpected">What did you expect to happen?</Label>
            <textarea id="whatExpected" name="whatExpected" rows={2} className={inputClass} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="frequency">How often does it happen?</Label>
            <select id="frequency" name="frequency" className={inputClass} defaultValue="">
              <option value="">Not sure</option>
              <option value="ALWAYS">Always</option>
              <option value="SOMETIMES">Sometimes</option>
              <option value="ONCE">It happened once</option>
            </select>
          </div>
          <div>
            <Label htmlFor="occurredAt" hint="optional">
              When did it happen?
            </Label>
            <input id="occurredAt" name="occurredAt" type="datetime-local" className={inputClass} />
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-ink-900">Attachments</legend>
        <p id="attachments-help" className="mt-1 text-sm text-ink-500">
          Screenshots help us a great deal. Up to {maxAttachments} files, {maxAttachmentMb} MB each.
        </p>
        <div className="mt-2">
          <Label htmlFor="attachments" hint="optional">
            Add screenshots or documents
          </Label>
        </div>
        <input
          aria-describedby="attachments-help"
          id="attachments"
          name="attachments"
          type="file"
          multiple
          accept={acceptAttribute()}
          className="block w-full text-sm text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink-700 hover:file:bg-ink-200"
        />
        <FieldError id="file-error" errors={errors?.file} />
      </fieldset>

      <div className="rounded-xl border border-ink-200 bg-ink-50 p-4">
        <button
          type="button"
          onClick={() => setShowTechnical((v) => !v)}
          aria-expanded={showTechnical}
          aria-controls="technical-details"
          className="flex w-full items-center justify-between text-left text-sm font-medium text-ink-700"
        >
          Technical details
          <span className="text-xs font-normal text-ink-500">
            {showTechnical ? 'Hide' : 'Optional — we fill most of this in for you'}
          </span>
        </button>
        <div
          id="technical-details"
          hidden={!showTechnical}
          className="mt-4 grid gap-4 sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <Label htmlFor="pageUrl">Page address where it happened</Label>
            <input
              id="pageUrl"
              name="pageUrl"
              type="url"
              placeholder="https://…"
              className={inputClass}
            />
          </div>
          <div>
            <Label htmlFor="os">Operating system</Label>
            <input id="os" name="os" defaultValue={environment.os} className={inputClass} />
          </div>
          <div>
            <Label htmlFor="device">Device</Label>
            <input
              id="device"
              name="device"
              defaultValue={environment.device}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      <input type="hidden" name="browser" value={environment.browser} />
      {showTechnical ? null : <input type="hidden" name="os" value={environment.os} />}
      {showTechnical ? null : <input type="hidden" name="device" value={environment.device} />}

      <div className="flex flex-col gap-3 border-t border-ink-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-ink-500">
          We will email you a ticket reference and a secure link to follow progress.
        </p>
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? 'Submitting…' : 'Submit report'}
        </Button>
      </div>
    </form>
  );
}
