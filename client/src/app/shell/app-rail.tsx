import type { AuthUserDto } from '@lorkarium/contracts';
import { LayoutListIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NavLink, useMatch } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useRail, type RailStore } from '@/stores/rail-store';
import { UserMenu } from './user-menu';

export type AppRailProps = Readonly<{
  railStore: StoreApi<RailStore>;
  user: AuthUserDto;
  onSignOut: () => Promise<void>;
  className?: string;
}>;

/** Desktop navigation rail: brand, "Principal" nav, user menu and the expand/collapse toggle.
 *  The frame steps back (panel surface, small icons) so the content leads.
 *
 *  Example: `<AppRail railStore={railStore} user={user} onSignOut={signOut} className="hidden md:flex" />` */
export function AppRail({
  railStore,
  user,
  onSignOut,
  className,
}: AppRailProps): React.JSX.Element {
  const { rail, toggle } = useRail(railStore);
  const expanded = rail === 'expanded';
  return (
    <aside
      aria-label="Menu lateral"
      className={cn(
        'sticky top-0 h-svh shrink-0 flex-col border-r border-border bg-panel transition-[width] duration-150 motion-reduce:transition-none',
        expanded ? 'w-56' : 'w-14',
        className,
      )}
    >
      <RailBrand expanded={expanded} />
      <RailNav expanded={expanded} />
      <div className="mt-auto flex flex-col gap-1 border-t border-border p-2">
        <UserMenu user={user} expanded={expanded} onSignOut={onSignOut} />
        <RailToggle expanded={expanded} onToggle={toggle} />
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
  // A string, not NavLink's className function: the tooltip's Slot (asChild) stringifies functions.
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

// The active item is a gold stroke on the left edge, not a filled box.
function railLinkClass(isActive: boolean, expanded: boolean): string {
  return cn(
    'relative flex h-10 items-center gap-3 rounded-lg text-sm font-medium text-muted-foreground no-underline hover:bg-muted hover:text-foreground hover:no-underline',
    expanded ? 'px-3' : 'justify-center',
    isActive &&
      'text-foreground before:absolute before:inset-y-2 before:-left-2 before:w-0.5 before:bg-primary',
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
