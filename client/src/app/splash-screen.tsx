import type { StoreApi } from 'zustand/vanilla';
import { BrandMark } from '@/components/brand-mark';
import { useSession, type SessionStore } from '@/stores/session-store';

/** Shown while the boot "who am I" runs, so a signed-in visitor never sees the login form flash;
 *  says it is reconnecting while the server does not answer (a deploy).
 *
 *  Example: `{ HydrateFallback: () => <SplashScreen sessionStore={sessionStore} /> }` on the root route */
export function SplashScreen({
  sessionStore,
}: Readonly<{ sessionStore: StoreApi<SessionStore> }>): React.JSX.Element {
  const session = useSession(sessionStore);
  const reconnecting = session.status === 'unknown' && session.reconnecting;
  return (
    <div className="grid min-h-svh place-items-center bg-background">
      <div role="status" className="flex flex-col items-center gap-5">
        <BrandMark />
        {reconnecting ? (
          <span className="text-sm text-muted-foreground">Reconectando ao servidor…</span>
        ) : (
          <span className="sr-only">Carregando…</span>
        )}
        <span aria-hidden="true" className="h-px w-16 animate-pulse bg-primary" />
      </div>
    </div>
  );
}
