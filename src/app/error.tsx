'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/primitives';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest correlates with the server log entry; the message itself is not shown.
    console.error('render_error', { digest: error.digest });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-lg font-semibold text-ink-900">Something went wrong</h1>
      <p className="mt-2 text-sm text-ink-600">
        The page could not be loaded. The error has been logged and our team can look into it.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-ink-500">Reference: {error.digest}</p>
      ) : null}
      <div className="mt-6">
        <Button onClick={reset}>Try again</Button>
      </div>
    </main>
  );
}
