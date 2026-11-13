import type { CampaignDetailDto } from '@lorkarium/contracts';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { StoreApi } from 'zustand/vanilla';
import { useTitleBarSlot } from '@/app/title-bar/title-bar-slot';
import { CopyCodeButton } from '@/components/copy-code-button';
import { RoomName } from '@/features/maps/room-name';
import { useViewerMainSheet } from '@/features/sheets/use-viewer-main-sheet';
import { formatCampaignCode } from '@/lib/campaign-code';
import { watchesOnly } from '@/lib/table-role';
import { cn } from '@/lib/utils';
import type { Clipboard } from '@/services/clipboard';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';
import type { OpenTablesStore } from '@/stores/open-tables-store';
import type { SceneTabsStore } from '@/stores/scene-tabs-store';
import { useSession, type SessionStore } from '@/stores/session-store';
import { SPECTATOR_BADGE } from './board-messages';
import { RoomTableMenu } from './room-table-menu';
import { RoomTabStrip } from './room-tab-strip';
import type { DocumentWorkspaceStore } from '@/stores/document-workspace-store';

export type RoomHeaderProps = Readonly<{
  campaign: CampaignDetailDto;
  /** The board of the tab shown (its turn line). */
  board: StoreApi<BoardStore> | null;
  /** The grid tabs of the table, once it is open. */
  tabs: StoreApi<SceneTabsStore> | null;
  interaction: StoreApi<BoardInteractionStore>;
  openTables: StoreApi<OpenTablesStore>;
  clipboard: Clipboard;
  /** The signed-in account: an admin gets the juggernaut switch in the table menu. */
  sessionStore: StoreApi<SessionStore>;
  /** Whether the room is shown (not covered by a page), so the desktop title bar can host it. */
  inTitleBar: boolean;
  documentWorkspace?: StoreApi<DocumentWorkspaceStore>;
}>;

/** The 48px top bar of the room: the main map and the viewer's main sheet, the name with the
 *  table menu's chevron right after it (`RoomTableMenu`) (and the "Espectador" badge of whoever only
 *  watches), and the code (master only); under it, the tabs strip
 *  (`RoomTabStrip`). In the desktop app the top band moves into the window title bar (a portal), which drags the window from its
 *  empty space and keeps its own logo (the room top draws none).
 *
 *  Example: `<RoomHeader campaign={campaign} board={board} tabs={tabs} interaction={interaction} openTables={openTables} clipboard={clipboard} sessionStore={sessionStore} inTitleBar />` */
export function RoomHeader({
  campaign,
  board,
  tabs,
  interaction,
  openTables,
  clipboard,
  sessionStore,
  inTitleBar,
  documentWorkspace,
}: RoomHeaderProps): React.JSX.Element | null {
  const session = useSession(sessionStore);
  const reader = session.status === 'authenticated' ? session.user : null;
  const mainSheet = useViewerMainSheet(reader?.id ?? null);
  const slot = useTitleBarSlot(inTitleBar);
  const [menuOpen, setMenuOpen] = useState(false);
  const top = (
    <section
      aria-label="Topo da sala"
      className={cn(
        'flex shrink-0 items-center gap-4',
        slot ? 'min-w-0 flex-1 px-2' : 'h-12 border-b border-border bg-panel px-3',
      )}
    >
      <RoomName
        campaign={campaign}
        tabs={tabs}
        workspace={documentWorkspace}
        mainSheet={mainSheet}
        menu={{
          open: () => setMenuOpen(true),
          chevron: (
            <RoomTableMenu
              open={menuOpen}
              onOpenChange={setMenuOpen}
              campaign={campaign}
              reader={reader}
              openTables={openTables}
              interaction={interaction}
              clipboard={clipboard}
            />
          ),
        }}
      />
      {watchesOnly(campaign.myRole) && <SpectatorBadge />}
      <div data-app-region="no-drag" className="ml-auto flex shrink-0 items-center gap-3">
        {campaign.joinCode && (
          <TableCode code={campaign.joinCode} clipboard={clipboard} iconOnly={slot !== null} />
        )}
      </div>
    </section>
  );
  return (
    <>
      {slot ? createPortal(top, slot) : top}
      <RoomTabStrip
        campaignId={campaign.id}
        tabs={tabs}
        documentWorkspace={documentWorkspace}
        mainSheetKey={mainSheet?.key ?? null}
        board={board}
        interaction={interaction}
      />
    </>
  );
}

// Text, not an icon: it tells why the tools are gone (a reconnection would look the same).
function SpectatorBadge(): React.JSX.Element {
  return (
    <span className="shrink-0 rounded-sm border border-border px-1.5 py-0.5 text-[11px] tracking-[0.12em] text-label uppercase">
      {SPECTATOR_BADGE}
    </span>
  );
}

type TableCodeProps = Readonly<{
  code: string;
  clipboard: Clipboard;
  /** In the window title bar: the copy button without its text. */
  iconOnly: boolean;
}>;

// In the flow beside the actions, never centered over the bar: the tabs filled the middle and
// drew under it.
function TableCode({ code, clipboard, iconOnly }: TableCodeProps) {
  const formatted = formatCampaignCode(code);
  return (
    <div className="hidden shrink-0 items-center gap-2 xl:flex">
      <span className="font-brand text-sm tracking-[0.2em] text-label">{formatted}</span>
      <CopyCodeButton code={formatted} clipboard={clipboard} iconOnly={iconOnly} />
    </div>
  );
}
