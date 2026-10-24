import { NavLink, useMatch } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { CampaignCover } from '@/components/campaign-cover';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useLeaveTable } from '@/features/sessions/use-leave-table';
import { cn } from '@/lib/utils';
import { useOpenTables, type OpenTable, type OpenTablesStore } from '@/stores/open-tables-store';
import {
  selectOnlineCount,
  useTablePresence,
  type TablePresenceState,
} from '@/stores/table-presence-store';
import { railLinkClass } from './rail-link-class';

export type OpenTablesNavProps = Readonly<{
  openTables: StoreApi<OpenTablesStore>;
  expanded: boolean;
  onNavigate?: () => void;
}>;

/** "Mesas abertas": the tables this tab keeps open, in the order they were opened, each with
 *  how many are online. The context menu of each (right click, long press, menu key or
 *  Shift+F10) offers "Sair da mesa". Absent while none is open.
 *
 *  Example: `<OpenTablesNav openTables={openTables} expanded={expanded} />` */
export function OpenTablesNav({
  openTables,
  expanded,
  onNavigate,
}: OpenTablesNavProps): React.JSX.Element | null {
  const tables = useOpenTables(openTables, (state) => state.tables);
  const leaveTable = useLeaveTable(openTables);
  if (tables.length === 0) return null;
  return (
    <TooltipProvider>
      <nav
        aria-label="Mesas abertas"
        className={cn('flex flex-col gap-1 p-2', !expanded && 'border-t border-border')}
      >
        {expanded && (
          <p
            aria-hidden="true"
            className="px-3 pt-2 pb-1 text-[11px] tracking-[0.12em] text-muted-foreground uppercase"
          >
            Mesas abertas
          </p>
        )}
        {tables.map((table) => (
          <OpenTableItem
            key={table.campaignId}
            table={table}
            expanded={expanded}
            onNavigate={onNavigate}
            onLeave={() => void leaveTable(table.campaignId)}
          />
        ))}
      </nav>
    </TooltipProvider>
  );
}

type OpenTableLinkProps = Readonly<{
  table: OpenTable;
  expanded: boolean;
  onNavigate?: () => void;
}>;

function OpenTableItem({
  onLeave,
  ...link
}: OpenTableLinkProps & Readonly<{ onLeave: () => void }>): React.JSX.Element {
  return (
    <ContextMenu>
      <OpenTableLink {...link} />
      <ContextMenuContent>
        <ContextMenuItem variant="destructive" onSelect={onLeave}>
          Sair da mesa
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function OpenTableLink({ table, expanded, onNavigate }: OpenTableLinkProps): React.JSX.Element {
  const to = `/campaigns/${table.campaignId}/table`;
  const active = useMatch({ path: to, end: true }) !== null;
  const presence = useTablePresence(table.presence, presenceLabel);
  // Class as a string inside asChild: the Slots of both triggers stringify functions.
  const link = (
    <ContextMenuTrigger asChild>
      <NavLink to={to} end onClick={onNavigate} className={railLinkClass(active, expanded)}>
        <CampaignCover cover={table.cover} className="h-6 w-8 shrink-0" />
        <span className={expanded ? 'flex min-w-0 flex-col leading-tight' : 'sr-only'}>
          <span className="truncate">{table.name}</span>
          <span className="text-xs font-normal text-muted-foreground">{presence}</span>
        </span>
      </NavLink>
    </ContextMenuTrigger>
  );
  if (expanded) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{`${table.name} · ${presence}`}</TooltipContent>
    </Tooltip>
  );
}

function presenceLabel(state: TablePresenceState): string {
  if (state.status === 'failed') return 'indisponível';
  if (state.status !== 'live') return 'conectando…';
  return `${selectOnlineCount(state)} online`;
}
