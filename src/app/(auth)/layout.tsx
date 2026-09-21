import { BrandMark } from '@/components/ui/brand-mark';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-ink-50">
      <header className="px-4 py-4 sm:px-6">
        <BrandMark />
      </header>
      <main
        id="main"
        className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center sm:py-12"
      >
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
