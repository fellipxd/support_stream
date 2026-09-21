import type { ReactNode } from 'react';
import Link from 'next/link';

/** Small shared building blocks. Keeps pages declarative and the styling consistent. */

/** Every interactive surface animates on the same 150ms ease-out curve. */
const MOTION =
  'transition-[background-color,border-color,box-shadow,color,transform] duration-150 ease-out';

export function Card({
  children,
  className = '',
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  /** Adds lift on hover. Only for cards that are themselves a link or a button. */
  interactive?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-ink-200 bg-white shadow-xs ${
        interactive ? `${MOTION} hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-md` : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-200 px-5 py-3.5">
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-ink-900">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-ink-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Page title block. Used by every routed page so headings stay identical. */
export function PageHeader({
  title,
  description,
  action,
  eyebrow,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-700">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {description ? <p className="mt-1.5 text-sm text-ink-600">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** A single figure. Always rendered inside a <dl>. */
export function StatTile({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
}) {
  const shell = `group relative block overflow-hidden rounded-xl border border-ink-200 bg-white px-4 py-3.5 shadow-xs ${MOTION}`;
  const body = (
    <>
      <dt className="text-[11px] font-semibold uppercase tracking-widest text-ink-500">{label}</dt>
      <dd className="mt-1.5 font-display text-2xl font-semibold tabular-nums tracking-tight text-ink-900">
        {value}
      </dd>
      {hint ? <dd className="mt-0.5 text-xs text-ink-500">{hint}</dd> : null}
    </>
  );

  if (!href) return <div className={shell}>{body}</div>;
  return (
    <Link
      href={href}
      className={`${shell} hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-md`}
    >
      {body}
      <span
        aria-hidden="true"
        className={`absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-accent-500 ${MOTION} group-hover:scale-x-100`}
      />
    </Link>
  );
}

export function Badge({
  children,
  tone = 'bg-ink-100 text-ink-700 ring-ink-500/20',
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4 ring-1 ring-inset ${tone}`}
    >
      {children}
    </span>
  );
}

const VARIANTS = {
  primary:
    'bg-brand-600 text-white shadow-xs hover:bg-brand-700 hover:shadow-sm active:translate-y-px disabled:bg-brand-600/50 disabled:shadow-none',
  secondary:
    'bg-white text-ink-700 shadow-xs ring-1 ring-inset ring-ink-300 hover:bg-ink-50 hover:text-ink-900 hover:ring-ink-400 active:translate-y-px',
  dark: 'bg-ink-900 text-white shadow-xs hover:bg-ink-700 hover:shadow-sm active:translate-y-px',
  /** For placing on the dark brand hero. */
  inverse: 'bg-white text-brand-900 shadow-sm hover:bg-accent-100 active:translate-y-px',
  /** Quiet companion to `inverse`, also for dark backgrounds. */
  outlineInverse:
    'text-white ring-1 ring-inset ring-white/30 hover:bg-white/10 hover:ring-white/50 active:translate-y-px',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
  danger:
    'bg-rose-600 text-white shadow-xs hover:bg-rose-700 hover:shadow-sm active:translate-y-px',
};

const SIZES = {
  sm: 'gap-1.5 rounded-lg px-2.5 py-1.5 text-xs',
  md: 'gap-2 rounded-lg px-3.5 py-2 text-sm',
};

type ButtonProps = {
  children: ReactNode;
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center font-medium ${MOTION} disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  variant = 'primary',
  size = 'md',
  className = '',
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center font-medium ${MOTION} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {children}
    </Link>
  );
}

/** Segmented navigation pill. Shared by the queue tabs and the report date ranges. */
export function PillLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${MOTION} ${
        active
          ? 'bg-ink-900 text-white shadow-xs'
          : 'bg-white text-ink-600 shadow-xs ring-1 ring-inset ring-ink-300 hover:bg-ink-50 hover:text-ink-900 hover:ring-ink-400'
      }`}
    >
      {children}
    </Link>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div
        className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-ink-50 text-ink-400 ring-1 ring-inset ring-ink-200"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="h-5 w-5"
        >
          <path
            d="M9 12h6m-6 4h3M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className="mt-1 text-sm text-rose-700">
      {errors[0]}
    </p>
  );
}

export function FormAlert({
  message,
  tone = 'error',
}: {
  message: string;
  tone?: 'error' | 'success';
}) {
  const styles =
    tone === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-800'
      : 'border-emerald-200 bg-emerald-50 text-emerald-800';
  return (
    <div
      role="alert"
      className={`animate-scale-in rounded-lg border px-3 py-2 text-sm shadow-xs ${styles}`}
    >
      {message}
    </div>
  );
}

export const inputClass =
  'block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-ink-900 shadow-xs ring-1 ring-inset ring-ink-300 transition-[box-shadow,background-color] duration-150 ease-out placeholder:text-ink-500 hover:ring-ink-400 focus:ring-2 focus:ring-inset focus:ring-brand-600';

export function Label({
  htmlFor,
  children,
  hint,
  required,
}: {
  htmlFor: string;
  children: ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-ink-900">
      {children}
      {required ? (
        <span className="ml-0.5 text-rose-700" aria-hidden="true">
          *
        </span>
      ) : null}
      {hint ? <span className="ml-1.5 font-normal text-ink-500">{hint}</span> : null}
    </label>
  );
}
