import { BrandMark } from '@/components/brand-mark';

/** Shown while the boot "who am I" runs, so a signed-in visitor never sees the login form flash.
 *
 *  Example: `{ HydrateFallback: SplashScreen }` on the root route */
export function SplashScreen(): React.JSX.Element {
  return (
    <div className="grid min-h-svh place-items-center bg-background">
      <div role="status" className="flex flex-col items-center gap-5">
        <BrandMark />
        <span className="sr-only">Carregando…</span>
        <span aria-hidden="true" className="h-px w-16 animate-pulse bg-primary" />
      </div>
    </div>
  );
}
