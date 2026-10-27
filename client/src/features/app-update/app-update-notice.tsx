import { RefreshCwIcon } from 'lucide-react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { useAppUpdateStale, type AppUpdateStore } from '@/stores/app-update-store';
import { useAppUpdateWatch } from './use-app-update-watch';

export type AppUpdateNoticeProps = Readonly<{
  appUpdate: StoreApi<AppUpdateStore>;
  reloadPage: () => void;
}>;

/** Watches for a new client build (`useAppUpdateWatch`) and shows its notice on top of any
 *  screen until the page reloads, by the button or on its own when it is safe. Once, at the root.
 *
 *  Example: `<AppUpdateNotice appUpdate={appUpdate} reloadPage={() => location.reload()} />` */
export function AppUpdateNotice({
  appUpdate,
  reloadPage,
}: AppUpdateNoticeProps): React.JSX.Element | null {
  useAppUpdateWatch({ appUpdate, reloadPage });
  const stale = useAppUpdateStale(appUpdate);
  if (!stale) return null;
  return (
    <div
      role="status"
      className="fixed top-[calc(var(--title-bar-height)+0.75rem)] left-1/2 z-50 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-[4px] border border-border bg-panel px-4 py-2 text-sm text-foreground"
    >
      <p>Saiu uma versão nova do Lorkarium.</p>
      <Button size="sm" onClick={reloadPage}>
        <RefreshCwIcon aria-hidden="true" />
        Recarregar
      </Button>
    </div>
  );
}
