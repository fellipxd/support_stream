'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Scroll reveal, done with an IntersectionObserver and a CSS class toggle — no animation
 * library. The hidden state lives in `.reveal` in globals.css so nothing flashes between
 * the server render and hydration, `prefers-reduced-motion` disables it there too, and the
 * <noscript> block in the root layout keeps the content visible when JavaScript never runs.
 * Only opacity and transform change, so revealing never shifts the layout.
 */
export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  /** Stagger in milliseconds. Keep under ~200ms so nothing feels slow. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      data-revealed={revealed ? 'true' : undefined}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
