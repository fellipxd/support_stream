import Link from 'next/link';

/**
 * The monogram and wordmark. Shared by every shell header so the mark is identical
 * everywhere — a deep brand square with a brass hairline under it.
 */
export function BrandMark({
  href = '/',
  label = 'Support Portal',
  hideLabelOnMobile = false,
}: {
  href?: string;
  label?: string;
  hideLabelOnMobile?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex shrink-0 items-center gap-2.5 text-sm font-semibold text-ink-900"
    >
      <span
        aria-hidden="true"
        className="relative flex h-7 w-7 items-center justify-center rounded-md bg-brand-700 font-display text-[13px] leading-none text-white shadow-xs transition-colors duration-150 ease-out group-hover:bg-brand-600"
      >
        S
        <span className="absolute inset-x-1 -bottom-px h-px bg-accent-500" />
      </span>
      <span className={`tracking-tight ${hideLabelOnMobile ? 'hidden sm:inline' : ''}`}>
        {label}
      </span>
    </Link>
  );
}
