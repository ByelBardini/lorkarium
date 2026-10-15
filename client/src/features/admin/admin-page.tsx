import { ArrowLeftIcon } from 'lucide-react';
import { Link } from 'react-router';
import { BrandMark } from '@/components/brand-mark';

/** Backoffice entry (placeholder). Loaded lazily, so players never download it; the server still
 *  guards every admin endpoint with `requireRole('admin')`.
 *
 *  Example: `{ path: 'admin', lazy: async () => ({ Component: (await import('./admin-page')).AdminPage }) }` */
export function AdminPage(): React.JSX.Element {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <title>Lorkarium · Backoffice</title>
      <header className="flex items-center border-b border-border px-4 py-4 sm:px-8">
        <BrandMark variant="compact" />
      </header>
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-16 sm:px-8">
        <h1 className="font-display text-[40px] leading-[1.1] font-semibold">Backoffice</h1>
        <p className="text-muted-foreground">As ferramentas de administração vão morar aqui.</p>
        <Link to="/" className="inline-flex w-fit items-center gap-2">
          <ArrowLeftIcon aria-hidden="true" className="size-4" />
          Voltar ao início
        </Link>
      </main>
    </div>
  );
}
