import Link from 'next/link';
import { PRIORITY_LABEL, SEVERITY_LABEL, STATUS_LABEL } from '@/lib/labels';
import { inputClass } from '@/components/ui/primitives';

type Props = {
  portals: { id: string; name: string }[];
  basePath: string;
  values: Record<string, string | undefined>;
};

/**
 * Filters submit as a plain GET form, so every view is linkable, bookmarkable and works
 * without JavaScript — and pagination stays server-side.
 */
export function TicketFilters({ portals, basePath, values }: Props) {
  const hasFilters = ['q', 'status', 'portalId', 'severity', 'priority'].some((k) => values[k]);

  return (
    <form
      action={basePath}
      method="get"
      className="rounded-xl border border-slate-200 bg-white p-4"
    >
      {values.tab ? <input type="hidden" name="tab" value={values.tab} /> : null}
      {values.mine ? <input type="hidden" name="mine" value={values.mine} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <label htmlFor="filter-q" className="mb-1 block text-xs font-medium text-slate-600">
            Search
          </label>
          <input
            id="filter-q"
            name="q"
            type="search"
            defaultValue={values.q ?? ''}
            placeholder="Ticket key, title or description"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="filter-portal" className="mb-1 block text-xs font-medium text-slate-600">
            Portal
          </label>
          <select
            id="filter-portal"
            name="portalId"
            defaultValue={values.portalId ?? ''}
            className={inputClass}
          >
            <option value="">All portals</option>
            {portals.map((portal) => (
              <option key={portal.id} value={portal.id}>
                {portal.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filter-status" className="mb-1 block text-xs font-medium text-slate-600">
            Status
          </label>
          <select
            id="filter-status"
            name="status"
            defaultValue={values.status ?? ''}
            className={inputClass}
          >
            <option value="">Any status</option>
            {(Object.keys(STATUS_LABEL) as Array<keyof typeof STATUS_LABEL>).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="filter-priority"
            className="mb-1 block text-xs font-medium text-slate-600"
          >
            Priority
          </label>
          <select
            id="filter-priority"
            name="priority"
            defaultValue={values.priority ?? ''}
            className={inputClass}
          >
            <option value="">Any priority</option>
            {(Object.keys(PRIORITY_LABEL) as Array<keyof typeof PRIORITY_LABEL>).map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABEL[priority]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          Apply filters
        </button>
        {hasFilters ? (
          <Link
            href={basePath}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Clear
          </Link>
        ) : null}
        <select
          name="severity"
          defaultValue={values.severity ?? ''}
          aria-label="Severity"
          className="ml-auto rounded-lg border-0 bg-white px-2 py-1.5 text-xs text-slate-700 ring-1 ring-inset ring-slate-300"
        >
          <option value="">Any severity</option>
          {(Object.keys(SEVERITY_LABEL) as Array<keyof typeof SEVERITY_LABEL>).map((severity) => (
            <option key={severity} value={severity}>
              {SEVERITY_LABEL[severity]}
            </option>
          ))}
        </select>
        <select
          name="sort"
          defaultValue={values.sort ?? 'newest'}
          aria-label="Sort order"
          className="rounded-lg border-0 bg-white px-2 py-1.5 text-xs text-slate-700 ring-1 ring-inset ring-slate-300"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="priority">Highest priority</option>
          <option value="updated">Recently updated</option>
        </select>
      </div>
    </form>
  );
}
