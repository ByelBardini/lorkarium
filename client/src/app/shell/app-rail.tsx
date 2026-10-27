import type { AuthUserDto } from '@lorkarium/contracts';
import { CompassIcon, LayoutListIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NavLink, useMatch } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { EXPLORE_PATH } from '@/features/explore/explore-route';
import { cn } from '@/lib/utils';
import type { OpenTablesStore } from '@/stores/open-tables-store';
import { useRail, type RailStore } from '@/stores/rail-store';
import { OpenTablesNav } from './open-tables-nav';
import { railLinkClass } from './rail-link-class';
import { UserMenu } from './user-menu';

export type AppRailProps = Readonly<{
  railStore: StoreApi<RailStore>;
  openTables: StoreApi<OpenTablesStore>;
  user: AuthUserDto;
  onSignOut: () => Promise<void>;
  /** Forced collapsed with no toggle, leaving the stored preference alone (the play room). */
  compact?: boolean;
  /** Off in the desktop app, whose title bar already shows the logo right above. */
  showBrand?: boolean;
  className?: string;
}>;

/** Desktop navigation rail: brand, "Principal" nav, the open tables, user menu and the
 *  expand/collapse toggle. The frame steps back (panel surface, small icons) so the content leads.
 *
 *  Example: `<AppRail railStore={railStore} openTables={openTables} user={user} onSignOut={signOut} className="hidden md:flex" />` */
export function AppRail({
  railStore,
  openTables,
  user,
  onSignOut,
  compact = false,
  showBrand = true,
  className,
}: AppRailProps): React.JSX.Element {
  const { rail, toggle } = useRail(railStore);
  const expanded = rail === 'expanded' && !compact;
  return (
    <aside
      aria-label="Menu lateral"
      className={cn(
        'sticky top-0 h-app shrink-0 flex-col border-r border-border bg-panel transition-[width] duration-150 motion-reduce:transition-none',
        expanded ? 'w-56' : 'w-14',
        className,
      )}
    >
      {showBrand && <RailBrand expanded={expanded} />}
      <RailNav expanded={expanded} />
      <OpenTablesNav openTables={openTables} expanded={expanded} />
      <div className="mt-auto flex flex-col gap-1 border-t border-border p-2">
        <UserMenu user={user} expanded={expanded} onSignOut={onSignOut} />
        {!compact && <RailToggle expanded={expanded} onToggle={toggle} />}
      </div>
    </aside>
  );
}

/** The brand at the top of the rail: crystal alone when collapsed, crystal + wordmark expanded. */
export function RailBrand({ expanded }: Readonly<{ expanded: boolean }>): React.JSX.Element {
  return (
    <div className={cn('flex h-16 items-center', expanded ? 'px-4' : 'justify-center')}>
      <BrandMark variant={expanded ? 'compact' : 'icon'} />
    </div>
  );
}

export type RailNavProps = Readonly<{ expanded: boolean; onNavigate?: () => void }>;

/** The "Principal" nav; collapsed, each link keeps its name for screen readers and in a tooltip. */
export function RailNav({ expanded, onNavigate }: RailNavProps): React.JSX.Element {
  return (
    <TooltipProvider>
      <nav aria-label="Principal" className="flex flex-col gap-1 p-2">
        <RailLink
          to="/"
          label="Mesas"
          icon={LayoutListIcon}
          expanded={expanded}
          onNavigate={onNavigate}
        />
        <RailLink
          to={EXPLORE_PATH}
          label="Explorar mesas"
          icon={CompassIcon}
          expanded={expanded}
          onNavigate={onNavigate}
        />
      </nav>
    </TooltipProvider>
  );
}

type RailLinkProps = Readonly<{
  to: string;
  label: string;
  icon: LucideIcon;
  expanded: boolean;
  onNavigate?: () => void;
}>;

function RailLink({
  to,
  label,
  icon: Icon,
  expanded,
  onNavigate,
}: RailLinkProps): React.JSX.Element {
  const active = useMatch({ path: to, end: true }) !== null;
  const link = (
    <NavLink to={to} end onClick={onNavigate} className={railLinkClass(active, expanded)}>
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className={expanded ? undefined : 'sr-only'}>{label}</span>
    </NavLink>
  );
  if (expanded) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

type RailToggleProps = Readonly<{ expanded: boolean; onToggle: () => void }>;

function RailToggle({ expanded, onToggle }: RailToggleProps): React.JSX.Element {
  const Icon = expanded ? PanelLeftCloseIcon : PanelLeftOpenIcon;
  return (
    <Button
      variant="ghost"
      aria-label={expanded ? 'Recolher menu' : 'Expandir menu'}
      aria-expanded={expanded}
      onClick={onToggle}
      className={cn(
        'h-10 text-muted-foreground',
        expanded ? 'justify-start px-3' : 'justify-center',
      )}
    >
      <Icon aria-hidden="true" />
      {expanded && <span>Recolher</span>}
    </Button>
  );
}
