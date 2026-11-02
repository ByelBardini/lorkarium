import type { CampaignDetailDto } from '@lorkarium/contracts';
import { LibraryIcon, SettingsIcon, TagIcon } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { useTitleBarSlot } from '@/app/title-bar/title-bar-slot';
import { CopyCodeButton } from '@/components/copy-code-button';
import { Button } from '@/components/ui/button';
import { TurnLine } from '@/features/combat/turn-line';
import { useLeaveTable } from '@/features/sessions/use-leave-table';
import { formatCampaignCode } from '@/lib/campaign-code';
import { watchesOnly } from '@/lib/table-role';
import { cn } from '@/lib/utils';
import type { Clipboard } from '@/services/clipboard';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';
import type { OpenTablesStore } from '@/stores/open-tables-store';
import type { RoomLayoutStore } from '@/stores/room-layout-store';
import type { SceneTabsStore } from '@/stores/scene-tabs-store';
import { useSession, type SessionStore } from '@/stores/session-store';
import {
  selectOnlineCount,
  useTablePresence,
  type TablePresenceStore,
} from '@/stores/table-presence-store';
import { SPECTATOR_BADGE } from './board-messages';
import { RoomMoreMenu } from './room-more-menu';
import { PanelToggle } from './room-panel';
import { SceneTabs } from './scene-tabs';
import type { DocumentWorkspaceStore } from '@/stores/document-workspace-store';

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
  /** The signed-in account: an admin gets the juggernaut switch ("Mais ações da mesa"). */
  sessionStore: StoreApi<SessionStore>;
  /** Whether the room is shown (not covered by a page), so the desktop title bar can host it. */
  inTitleBar: boolean;
  documentWorkspace?: StoreApi<DocumentWorkspaceStore>;
}>;

/** The 48px top bar of the room: name (and the "Espectador" badge of whoever only watches), who is online, the open grid tabs, the code (master
 *  only), "Biblioteca", "Condições" and "Configurações da mesa" (master only), the panel toggle,
 *  the admin's "Mais ações da mesa" (juggernaut mode) and "Sair da mesa". In the desktop app it moves into the window title bar (a portal), which
 *  drags the window from its empty space.
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
  sessionStore,
  inTitleBar,
  documentWorkspace,
}: RoomHeaderProps): React.JSX.Element | null {
  const leaveTable = useLeaveTable(openTables);
  const session = useSession(sessionStore);
  const reader = session.status === 'authenticated' ? session.user : null;
  const slot = useTitleBarSlot(inTitleBar);
  const top = (
    <section
      aria-label="Topo da sala"
      className={cn(
        'flex shrink-0 items-center gap-4',
        slot ? 'min-w-0 flex-1 pr-2' : 'h-12 border-b border-border bg-panel px-3',
      )}
    >
      <h1 className="min-w-0 truncate font-display text-xl font-semibold">{campaign.name}</h1>
      {watchesOnly(campaign.myRole) && <SpectatorBadge />}
      {presence && (
        <OnlineCount presence={presence} onShow={() => roomLayout.getState().showTab('people')} />
      )}
      {tabs && (
        // Fills the bar so the tabs know their room; only the tabs themselves stop the window drag.
        // The floor (two tabs and the "+N") makes a long table name truncate before the tabs
        // shrink to nothing.
        <div className="flex min-w-[min(20rem,35%)] flex-1">
          <SceneTabs tabs={tabs} documents={documentWorkspace} campaignId={campaign.id} />
        </div>
      )}
      {board && (
        <TurnLine
          board={board}
          interaction={interaction}
          className="hidden min-w-0 shrink truncate lg:block"
        />
      )}
      <div data-app-region="no-drag" className="ml-auto flex shrink-0 items-center gap-3">
        {campaign.joinCode && (
          <TableCode code={campaign.joinCode} clipboard={clipboard} centered={slot !== null} />
        )}
        <MasterPageLink
          to={`/campaigns/${encodeURIComponent(campaign.id)}/table/library`}
          name="Biblioteca"
        >
          <LibraryIcon aria-hidden="true" />
        </MasterPageLink>
        {campaign.myRole === 'master' && <MasterPageLinks campaignId={campaign.id} />}
        <PanelToggle roomLayout={roomLayout} openTables={openTables} campaignId={campaign.id} />
        <RoomMoreMenu
          campaign={campaign}
          reader={reader}
          openTables={openTables}
          interaction={interaction}
        />
        {/* Apart from the view controls: leaving is the one action that closes the room. */}
        <span aria-hidden="true" className="h-5 w-px bg-border" />
        <Button variant="outline" size="sm" onClick={() => void leaveTable(campaign.id)}>
          Sair da mesa
        </Button>
      </div>
    </section>
  );
  return slot ? createPortal(top, slot) : top;
}

// Text, not an icon: it tells why the tools are gone (a reconnection would look the same).
function SpectatorBadge(): React.JSX.Element {
  return (
    <span className="shrink-0 rounded-sm border border-border px-1.5 py-0.5 text-[11px] tracking-[0.12em] text-label uppercase">
      {SPECTATOR_BADGE}
    </span>
  );
}

function MasterPageLinks({ campaignId }: Readonly<{ campaignId: string }>): React.JSX.Element {
  const table = `/campaigns/${encodeURIComponent(campaignId)}/table`;
  return (
    <>
      <MasterPageLink to={`${table}/conditions`} name="Condições" title="Condições da mesa">
        <TagIcon aria-hidden="true" />
      </MasterPageLink>
      <MasterPageLink to={`${table}/settings`} name="Configurações da mesa" text="Configurações">
        <SettingsIcon aria-hidden="true" />
      </MasterPageLink>
    </>
  );
}

type MasterPageLinkProps = Readonly<{
  to: string;
  /** The accessible name, always the whole one. */
  name: string;
  /** What shows beside the icon from `xl`; the name when left out. */
  text?: string;
  /** The tooltip; the name when left out. */
  title?: string;
  /** The icon. */
  children: React.ReactNode;
}>;

// The text from `xl` only: the bar is already full of tabs and the turn line.
function MasterPageLink(props: MasterPageLinkProps): React.JSX.Element {
  return (
    <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
      <Link to={props.to} aria-label={props.name} title={props.title ?? props.name}>
        {props.children}
        <span className="hidden xl:inline">{props.text ?? props.name}</span>
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
      data-app-region="no-drag"
      onClick={onShow}
      className="shrink-0 text-xs tracking-[0.12em] text-muted-foreground uppercase outline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      {`${online} online`}
    </button>
  );
}

type TableCodeProps = Readonly<{
  code: string;
  clipboard: Clipboard;
  /** In the window title bar: in the middle of the bar, apart from the actions on the right. */
  centered: boolean;
}>;

function TableCode({ code, clipboard, centered }: TableCodeProps) {
  const formatted = formatCampaignCode(code);
  return (
    <div
      className={cn(
        'hidden shrink-0 items-center gap-2 xl:flex',
        // Centered only where the tabs and the turn line can't reach the middle of the bar.
        centered &&
          '2xl:absolute 2xl:top-1/2 2xl:left-1/2 2xl:-translate-x-1/2 2xl:-translate-y-1/2',
      )}
    >
      <span className="font-brand text-sm tracking-[0.2em] text-label">{formatted}</span>
      <CopyCodeButton code={formatted} clipboard={clipboard} iconOnly={centered} />
    </div>
  );
}
