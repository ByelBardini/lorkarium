import type { AuthUserDto } from '@lorkarium/contracts';
import { Outlet, useMatches, useNavigation } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { BrandMark } from '@/components/brand-mark';
import type { OpenTablesStore } from '@/stores/open-tables-store';
import type { RailStore } from '@/stores/rail-store';
import { AppRail } from './app-rail';
import { DeletedTableNotice } from './deleted-table-notice';
import { MobileRail } from './mobile-rail';
import { wantsCompactRail } from './rail-handle';
import { cn } from '@/lib/utils';

export type AppShellProps = Readonly<{
  railStore: StoreApi<RailStore>;
  openTables: StoreApi<OpenTablesStore>;
  user: AuthUserDto;
  onSignOut: () => Promise<void>;
}>;

/** The frame of every signed-in screen: rail on desktop, top bar + drawer on mobile, route in `main`
 *  (under the notice of a table deleted while open).
 *  A route whose `handle` is `COMPACT_RAIL_HANDLE` (the play room) gets the rail collapsed and
 *  a `main` exactly as tall as the viewport.
 *
 *  Example: `{ Component: () => <AppShell railStore={railStore} openTables={openTables} user={user} onSignOut={signOut} />, children }` */
export function AppShell({
  railStore,
  openTables,
  user,
  onSignOut,
}: AppShellProps): React.JSX.Element {
  const compact = wantsCompactRail(useMatches());
  return (
    <div
      className={cn(
        'flex bg-background text-foreground',
        compact ? 'h-svh overflow-hidden' : 'min-h-svh',
      )}
    >
      <AppRail
        railStore={railStore}
        openTables={openTables}
        user={user}
        onSignOut={onSignOut}
        compact={compact}
        className="hidden md:flex"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <NavigationProgress />
        <header className="flex items-center gap-2 border-b border-border px-2 py-2 md:hidden">
          <MobileRail openTables={openTables} user={user} onSignOut={onSignOut} />
          <BrandMark variant="compact" />
        </header>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <DeletedTableNotice openTables={openTables} />
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// A thin line while a loader runs; the first load is covered by the splash instead.
function NavigationProgress(): React.JSX.Element | null {
  const navigation = useNavigation();
  if (navigation.state === 'idle') return null;
  return (
    <div
      aria-hidden="true"
      className="fixed inset-x-0 top-0 z-50 h-0.5 animate-pulse bg-primary motion-reduce:animate-none"
    />
  );
}
