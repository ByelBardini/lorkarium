import type { CampaignDetailDto } from '@lorkarium/contracts';
import { LibraryIcon, SettingsIcon } from 'lucide-react';
import { Link } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { CopyCodeButton } from '@/components/copy-code-button';
import { Button } from '@/components/ui/button';
import { TurnLine } from '@/features/combat/turn-line';
import { useLeaveTable } from '@/features/sessions/use-leave-table';
import { formatCampaignCode } from '@/lib/campaign-code';
import type { Clipboard } from '@/services/clipboard';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';
import type { OpenTablesStore } from '@/stores/open-tables-store';
import type { RoomLayoutStore } from '@/stores/room-layout-store';
import type { SceneTabsStore } from '@/stores/scene-tabs-store';
import {
  selectOnlineCount,
  useTablePresence,
  type TablePresenceStore,
} from '@/stores/table-presence-store';
import { PanelToggle } from './room-panel';
import { SceneTabs } from './scene-tabs';

export type RoomHeaderProps = Readonly<{
  campaign: CampaignDetailDto;
  presence: StoreApi<TablePresenceStore> | null;
  /** The board of the tab shown (its turn line). */
  board: StoreApi<BoardStore> | null;
  /** The grid tabs of the table, once it is open. */
  tabs: StoreApi<SceneTabsStore> | null;
  interaction: StoreApi<BoardInteractionStore>;
  openTables: StoreApi<OpenTablesStore>;
  roomLayout: StoreApi<RoomLayoutStore>;
  clipboard: Clipboard;
}>;

/** The 48px top bar of the room: name, who is online, the open grid tabs, the code (master
 *  only), "Biblioteca", "Configurações da mesa" (master only), the panel toggle and "Sair da
 *  mesa".
 *
 *  Example: `<RoomHeader campaign={campaign} presence={presence} board={board} tabs={tabs} interaction={interaction} openTables={openTables} roomLayout={roomLayout} clipboard={clipboard} />` */
export function RoomHeader({
  campaign,
  presence,
  board,
  tabs,
  interaction,
  openTables,
  roomLayout,
  clipboard,
}: RoomHeaderProps): React.JSX.Element {
  const leaveTable = useLeaveTable(openTables);
  return (
    <section
      aria-label="Topo da sala"
      className="flex h-12 shrink-0 items-center gap-4 border-b border-border bg-panel px-3"
    >
      <h1 className="min-w-0 truncate font-display text-xl font-semibold">{campaign.name}</h1>
      {presence && (
        <OnlineCount presence={presence} onShow={() => roomLayout.getState().showTab('people')} />
      )}
      {tabs && <SceneTabs tabs={tabs} />}
      {board && <TurnLine board={board} interaction={interaction} className="hidden sm:block" />}
      <div className="ml-auto flex items-center gap-3">
        {campaign.joinCode && <TableCode code={campaign.joinCode} clipboard={clipboard} />}
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link to={`/campaigns/${encodeURIComponent(campaign.id)}/table/library`}>
            <LibraryIcon aria-hidden="true" />
            Biblioteca
          </Link>
        </Button>
        {campaign.myRole === 'master' && <SettingsLink campaignId={campaign.id} />}
        <PanelToggle roomLayout={roomLayout} />
        <Button variant="outline" size="sm" onClick={() => void leaveTable(campaign.id)}>
          Sair da mesa
        </Button>
      </div>
    </section>
  );
}

// The text from `xl` only: the bar is already full of tabs and the turn line.
function SettingsLink({ campaignId }: Readonly<{ campaignId: string }>): React.JSX.Element {
  return (
    <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
      <Link
        to={`/campaigns/${encodeURIComponent(campaignId)}/table/settings`}
        aria-label="Configurações da mesa"
        title="Configurações da mesa"
      >
        <SettingsIcon aria-hidden="true" />
        <span className="hidden xl:inline">Configurações</span>
      </Link>
    </Button>
  );
}

type OnlineCountProps = Readonly<{
  presence: StoreApi<TablePresenceStore>;
  onShow: () => void;
}>;

// Text, not a pill or avatar stack: it opens "Na mesa", where the names are.
function OnlineCount({ presence, onShow }: OnlineCountProps): React.JSX.Element | null {
  const known = useTablePresence(presence, (state) => state.version !== null);
  const online = useTablePresence(presence, selectOnlineCount);
  if (!known) return null;
  return (
    <button
      type="button"
      onClick={onShow}
      className="shrink-0 text-xs tracking-[0.12em] text-muted-foreground uppercase outline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      {`${online} online`}
    </button>
  );
}

function TableCode({ code, clipboard }: Readonly<{ code: string; clipboard: Clipboard }>) {
  const formatted = formatCampaignCode(code);
  return (
    <div className="hidden items-center gap-2 lg:flex">
      <span className="font-brand text-sm tracking-[0.2em] text-label">{formatted}</span>
      <CopyCodeButton code={formatted} clipboard={clipboard} />
    </div>
  );
}
