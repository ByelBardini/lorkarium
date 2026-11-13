import { DicesIcon, SwordsIcon, UsersIcon, type LucideIcon } from 'lucide-react';
import { useId } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { moveFocusAlongTabs } from '@/lib/tab-focus';
import { DESKTOP_QUERY, useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import { useRoomLayout, type RoomLayoutStore, type RoomTab } from '@/stores/room-layout-store';
import { ROOM_TAB_NAME } from './board-messages';
import {
  selectOnlineCount,
  useTablePresence,
  type TablePresenceStore,
} from '@/stores/table-presence-store';

const ROOM_TAB_ICON: Readonly<Record<RoomTab, LucideIcon>> = {
  combat: SwordsIcon,
  people: UsersIcon,
  dice: DicesIcon,
};

const RAIL_TABS: readonly RoomTab[] = ['combat', 'people', 'dice'];

export type RoomRailProps = Readonly<{
  roomLayout: StoreApi<RoomLayoutStore>;
  /** `null` until the table opens: "Na mesa" goes without its count. */
  presence: StoreApi<TablePresenceStore> | null;
}>;

/** The 46px rail of icons at the right of the room, beside the board (tablet and desktop): a
 *  click on the open tab collapses the panel, on another opens it there (`toggleTab`). On a phone
 *  there is no rail: the "Painel" sheet keeps its own tabs.
 *
 *  Example: `<RoomRail roomLayout={roomLayout} presence={table?.presence ?? null} />` */
export function RoomRail({ roomLayout, presence }: RoomRailProps): React.JSX.Element | null {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const open = useRoomLayout(roomLayout, (state) => state.panel === 'open');
  const shown = useRoomLayout(roomLayout, (state) => state.tab);
  if (!desktop) return null;
  return (
    <div
      role="tablist"
      aria-label="Painel da mesa"
      aria-orientation="vertical"
      onKeyDown={moveFocusAlongTabs}
      className="absolute inset-y-0 right-0 flex w-[46px] flex-col items-center gap-1 border-l border-border bg-panel py-2"
    >
      {RAIL_TABS.map((tab) => (
        <RailTab
          key={tab}
          tab={tab}
          selected={open && tab === shown}
          open={open}
          presence={tab === 'people' ? presence : null}
          onClick={() => roomLayout.getState().toggleTab(tab)}
        />
      ))}
    </div>
  );
}

type RailTabProps = Readonly<{
  tab: RoomTab;
  selected: boolean;
  /** Whether the panel is open, whatever its tab (`aria-expanded`). */
  open: boolean;
  presence: StoreApi<TablePresenceStore> | null;
  onClick: () => void;
}>;

function RailTab({ tab, selected, open, presence, onClick }: RailTabProps): React.JSX.Element {
  const Icon = ROOM_TAB_ICON[tab];
  const name = ROOM_TAB_NAME[tab];
  const countId = useId();
  return (
    <button
      type="button"
      role="tab"
      aria-label={name}
      title={name}
      aria-selected={selected}
      aria-expanded={open}
      aria-describedby={presence ? countId : undefined}
      tabIndex={selected || (!open && tab === 'combat') ? 0 : -1}
      onClick={onClick}
      className={cn(
        'relative grid size-9 cursor-pointer place-items-center rounded-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring',
        selected ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon aria-hidden="true" className="size-4.5" />
      {presence && <OnlinePill presence={presence} id={countId} />}
    </button>
  );
}

// The count for the eye; the description says it ("3 online"), as the top no longer does.
type OnlinePillProps = Readonly<{ presence: StoreApi<TablePresenceStore>; id: string }>;

function OnlinePill({ presence, id }: OnlinePillProps): React.JSX.Element {
  const online = useTablePresence(presence, selectOnlineCount);
  return (
    <>
      <span id={id} className="sr-only">{`${online} online`}</span>
      <span
        aria-hidden="true"
        className="absolute -top-0.5 -right-0.5 inline-grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground tabular-nums"
      >
        {online}
      </span>
    </>
  );
}
