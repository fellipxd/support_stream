import { LinkButton } from '@/components/ui/primitives';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-lg font-semibold text-slate-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-600">
        The page you are looking for does not exist, or you do not have access to it.
      </p>
      <div className="mt-6">
        <LinkButton href="/">Back to the support portal</LinkButton>
      </div>
    </main>
  );
}
