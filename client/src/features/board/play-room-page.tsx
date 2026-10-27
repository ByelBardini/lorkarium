import type { CampaignDetailDto } from '@lorkarium/contracts';
import { useEffect, useMemo, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { useOpenTable, type OpenTableView } from '@/features/sessions/use-open-table';
import { ApplyConditionDialog } from '@/features/combat/apply-condition-dialog';
import { ConditionToolPanel } from '@/features/combat/condition-tool-panel';
import { useConditionToolFollow } from '@/features/combat/use-condition-tool-follow';
import { TurnLine } from '@/features/combat/turn-line';
import {
  RoomTokenAuraDialog,
  RoomTokenDialog,
  RoomTokenImageDialog,
} from '@/features/tokens/room-token-dialog';
import { CardLinkDialog, type CardLinkRequest } from '@/features/tokens/token-link-items';
import type { BoardRenderer, CreateBoardRenderer } from '@/renderer/board-renderer';
import type { AssetsApi } from '@/services/assets-api';
import type { Clipboard } from '@/services/clipboard';
import type { BoardScope, TableBoardCommands } from '@/services/table-board-commands';
import type { PingCommands } from '@/services/table-pings';
import type { PingFeed } from '@/stores/ping-feed';
import { DrawStylePanel } from '@/features/drawings/draw-style-panel';
import { EffectAreaPanel } from '@/features/effect-areas/effect-area-panel';
import { RoomWallPanel } from '@/features/walls/room-wall-panel';
import { RoomLightPanel } from '@/features/lights/room-light-panel';
import { DoorMenu, type DoorMenuRequest } from '@/features/walls/door-menu';
import { LightMenu, type LightMenuRequest } from '@/features/lights/light-menu';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { DiceRendererFactory } from '@/dice-renderer/dice-renderer';
import type { DiceSoundFactory } from '@/dice-audio/dice-sound';
import { useDiceOverlay } from '@/features/dice/use-dice-overlay';
import { useDiceSound } from '@/features/dice/use-dice-sound';
import { DiceRollNotice } from '@/features/dice/dice-roll-notice';
import type { DicePreferencesStore } from '@/stores/dice-preferences-store';
import type { DiceCommands } from '@/services/dice-commands';
import type { SavedRollsApi } from '@/services/saved-rolls-api';
import { watchesOnly } from '@/lib/table-role';
import {
  createBoardInteractionStore,
  useBoardInteraction,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createConditionToolStore } from '@/stores/condition-tool-store';
import type { DrawingStyleStore } from '@/stores/drawing-style-store';
import type { EffectAreaStyleStore } from '@/stores/effect-area-style-store';
import type { WallStyleStore } from '@/stores/wall-style-store';
import type { LightColorStore } from '@/stores/light-color-store';
import type { AuraMotionStore } from '@/stores/aura-motion-store';
import type { LightReachStore } from '@/stores/light-reach-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import type { OpenTablesStore } from '@/stores/open-tables-store';
import type { SessionStore } from '@/stores/session-store';
import {
  GROUP_TAB,
  groupTabOf,
  useSceneTabOf,
  visibleTabOf,
  type SceneTabsStore,
} from '@/stores/scene-tabs-store';
import type { TableEditStore } from '@/stores/table-edit-store';
import { useRoomLayout, type RoomLayoutStore } from '@/stores/room-layout-store';
import { useTablePresence, type TablePresenceStore } from '@/stores/table-presence-store';
import { BoardArea } from './board-area';
import { DeleteSelectionDialog, type SelectionToDelete } from './delete-selection-dialog';
import { tokenCommandFailureMessage } from './board-messages';
import { BoardStatusLine } from './board-status-line';
import { BoardToolbar, type BoardToolbarProps } from './board-toolbar';
import { ConfigureSceneDialog } from './configure-scene-dialog';
import { FocusToggle } from './focus-toggle';
import { TokenContextMenu, type TokenMenuRequest } from './token-context-menu';
import { TokenHoverCard } from './token-hover-card';
import { useTokenHover } from './use-token-hover';
import { RoomHeader } from './room-header';
import { RoomSidePanel } from './room-panel';
import { useInteractionFollowsTable } from './use-interaction-follows-table';
import { usePlayerIdsOf } from './table-players';
import { RoomContexts } from './room-contexts';
import { useRoomTokenKeys } from './table-token-rights';
import { useViewerRole } from './use-viewer-role';
import { useBoardPings } from './use-board-pings';
import { useEditShortcuts } from './use-edit-shortcuts';
import { useRoomShortcuts } from './use-room-shortcuts';

export type PlayRoomPageProps = Readonly<{
  campaign: CampaignDetailDto;
  openTables: StoreApi<OpenTablesStore>;
  roomLayout: StoreApi<RoomLayoutStore>;
  drawingStyle: StoreApi<DrawingStyleStore>;
  effectAreaStyle: StoreApi<EffectAreaStyleStore>;
  wallStyle: StoreApi<WallStyleStore>;
  lightReach: StoreApi<LightReachStore>;
  lightColor: StoreApi<LightColorStore>;
  /** "Animar auras" in this browser (the toolbar's button). */
  auraMotion: StoreApi<AuraMotionStore>;
  clipboard: Clipboard;
  createBoardRenderer: CreateBoardRenderer;
  boardCommands: TableBoardCommands;
  pings: PingCommands;
  /** The signed-in account (the color of one's own ping). */
  sessionStore: StoreApi<SessionStore>;
  assets: AssetsApi;
  /** The delay before the hovered token's card shows. */
  interactionClock: InteractionClock;
  /** "Dados 3D" on this device: the rolls of the table thrown over the window. */
  dicePreferences: StoreApi<DicePreferencesStore>;
  createDiceRenderer: DiceRendererFactory;
  /** "Som dos dados": the knocks of the rolls of the table. */
  createDiceSound: DiceSoundFactory;
  /** The "Dados" tab: the roll, the saved rolls and the wall clock of the history. */
  dice: DiceCommands;
  savedRolls: SavedRollsApi;
  diceClock: InteractionClock;
  /** A page (settings, conditions) covers the room: the desktop title bar gets its place back. */
  covered?: boolean;
}>;

/** The play room: the board fills the screen, the top bar, tools and panel float over it, and
 *  focus mode (F, Esc) leaves the board alone. Opens the table among the tab's open tables; the
 *  board, the tools, the tracker and the token dock follow the grid tab shown ("Na mesa" stays
 *  on the group grid). A spectator (`campaign.myRole`) only watches: no edit tool, key, ping or
 *  token menu, and every command stops at `readOnly`; a role changed live is followed.
 *
 *  Example: `<PlayRoomPage key={campaign.id} campaign={campaign} openTables={deps.openTables} roomLayout={deps.roomLayout} clipboard={deps.clipboard} createBoardRenderer={deps.createBoardRenderer} />` */
export function PlayRoomPage(props: PlayRoomPageProps): React.JSX.Element {
  const { campaign, openTables, roomLayout, clipboard } = props;
  const opened = useOpenTable(campaign, openTables);
  const shown = useShownTab(campaign.id, opened, props.boardCommands);
  const { view, table, interaction, scopeOf } = shown;
  const [renderer, setRenderer] = useState<BoardRenderer | null>(null);
  const [sceneDialog, setSceneDialog] = useState(false);
  // `{ tokenId: null }` is "Novo token"; a token id is "Editar token".
  const [tokenDialog, setTokenDialog] = useState<Readonly<{ tokenId: string | null }> | null>(null);
  const [tokenMenu, setTokenMenu] = useState<TokenMenuRequest | null>(null);
  const [doorMenu, setDoorMenu] = useState<DoorMenuRequest | null>(null);
  const [lightMenu, setLightMenu] = useState<LightMenuRequest | null>(null);
  const [conditionTargets, setConditionTargets] = useState<readonly string[] | null>(null);
  const [imageTokenId, setImageTokenId] = useState<string | null>(null);
  const [auraTokenId, setAuraTokenId] = useState<string | null>(null);
  const [deletion, setDeletion] = useState<SelectionToDelete | null>(null);
  const [cardLink, setCardLink] = useState<CardLinkRequest | null>(null);
  const [conditionTool] = useState(createConditionToolStore);
  const role = campaign.myRole;
  const isMaster = role === 'master';
  const hover = useTokenHover(props.interactionClock);
  useEffect(() => interaction.getState().allowLayerChoice(isMaster), [interaction, isMaster]);
  const focus = useRoomLayout(roomLayout, (state) => state.focus);
  useRoomShortcuts({ roomLayout, interaction, role });
  const { dicePreferences, createDiceRenderer, createDiceSound } = props;
  useDiceOverlay({ campaignId: campaign.id, openTables, dicePreferences, createDiceRenderer });
  useDiceSound({ campaignId: campaign.id, openTables, dicePreferences, createDiceSound });
  useInteractionFollowsTable(table, interaction, role);
  useViewerRole(table && shown.tabs ? { ...table, tabs: shown.tabs } : null, props.sessionStore);
  const players = usePlayerIdsOf(table?.presence ?? null);
  const commands = props.boardCommands;
  const tokenKeys = useRoomTokenKeys(openTables, campaign);
  useEditShortcuts({ scopeOf, table, interaction, commands, role, tokenKeys });
  useConditionToolFollow(table ? { board: table.board, interaction, conditionTool } : null);
  const tool = useBoardInteraction(interaction, (state) => state.tool);
  const drawMode = useBoardInteraction(interaction, (state) => state.drawMode);
  const ping = useBoardPings({
    renderer,
    feed: shown.pings,
    presence: table?.presence ?? null,
    board: table?.board ?? null,
    interaction,
    scopeOf,
    pings: props.pings,
    session: props.sessionStore,
    role,
  });
  return (
    <RoomContexts players={players} tokenKeys={tokenKeys}>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-panel">
        <title>{`Lorkarium · ${campaign.name}`}</title>
        {!focus && (
          <RoomHeader
            campaign={campaign}
            presence={table?.presence ?? null}
            board={table?.board ?? null}
            tabs={shown.tabs}
            interaction={interaction}
            openTables={openTables}
            roomLayout={roomLayout}
            clipboard={clipboard}
            sessionStore={props.sessionStore}
            inTitleBar={!props.covered}
          />
        )}
        <div className="relative min-h-0 flex-1">
          <BoardArea
            key={shown.key}
            view={view}
            interaction={interaction}
            createBoardRenderer={props.createBoardRenderer}
            onRenderer={setRenderer}
            onOpenToken={(tokenId) => {
              interaction.getState().select(tokenId);
              roomLayout.getState().showTab('combat');
            }}
            onDeleteSelection={setDeletion}
            onTokenMenu={(request) => {
              hover.onTokenHover(null);
              if (!watchesOnly(role)) setTokenMenu(request);
            }}
            onTokenHover={hover.onTokenHover}
            onDoorMenu={(request) => isMaster && setDoorMenu(request)}
            onLightMenu={(request) => isMaster && setLightMenu(request)}
            drawingStyle={props.drawingStyle}
            effectAreaStyle={props.effectAreaStyle}
            wallStyle={props.wallStyle}
            lightReach={props.lightReach}
            lightColor={props.lightColor}
            conditionTool={conditionTool}
            onPing={ping}
          />
          {tool === 'draw' && !focus && (
            <DrawStylePanel
              drawingStyle={props.drawingStyle}
              mode={drawMode}
              onMode={interaction.getState().setDrawMode}
            />
          )}
          {tool === 'area' && !focus && <EffectAreaPanel effectAreaStyle={props.effectAreaStyle} />}
          {tool === 'conditions' && !focus && table && (
            <ConditionToolPanel
              board={table.board}
              conditionTool={conditionTool}
              campaignId={campaign.id}
              isMaster={isMaster}
            />
          )}
          {tool === 'walls' && !focus && table && (
            <RoomWallPanel
              board={table.board}
              interaction={interaction}
              wallStyle={props.wallStyle}
            />
          )}
          {tool === 'lights' && !focus && table && (
            <RoomLightPanel
              board={table.board}
              interaction={interaction}
              lightReach={props.lightReach}
              lightColor={props.lightColor}
            />
          )}
          {hover.hovered && table && (
            <TokenHoverCard request={hover.hovered} board={table.board} interaction={interaction} />
          )}
          {tokenMenu && table && (
            <TokenContextMenu
              request={tokenMenu}
              board={table.board}
              presence={table.presence}
              interaction={interaction}
              onApplyCondition={setConditionTargets}
              onChangeImage={setImageTokenId}
              onChangeAura={setAuraTokenId}
              characters={{ cast: table.cast, onConfirmLink: setCardLink }}
              onClose={() => setTokenMenu(null)}
            />
          )}
          {cardLink && (
            <CardLinkDialog
              request={cardLink}
              interaction={interaction}
              onClose={() => setCardLink(null)}
            />
          )}
          {doorMenu && table && (
            <DoorMenu
              request={doorMenu}
              board={table.board}
              interaction={interaction}
              onClose={() => setDoorMenu(null)}
            />
          )}
          {lightMenu && table && (
            <LightMenu
              request={lightMenu}
              board={table.board}
              interaction={interaction}
              onClose={() => setLightMenu(null)}
            />
          )}
          {conditionTargets && table && (
            <ApplyConditionDialog
              tokenIds={conditionTargets}
              board={table.board}
              interaction={interaction}
              isMaster={isMaster}
              onClose={() => setConditionTargets(null)}
            />
          )}
          {imageTokenId && table && (
            <RoomTokenImageDialog
              scope={scopeOf()}
              board={table.board}
              tokenId={imageTokenId}
              commands={props.boardCommands}
              assets={props.assets}
              onClose={() => setImageTokenId(null)}
            />
          )}
          {auraTokenId && table && (
            <RoomTokenAuraDialog
              scope={scopeOf()}
              board={table.board}
              tokenId={auraTokenId}
              commands={props.boardCommands}
              assets={props.assets}
              onClose={() => setAuraTokenId(null)}
            />
          )}
          {deletion && (
            <DeleteSelectionDialog
              selection={deletion}
              interaction={interaction}
              onClose={() => setDeletion(null)}
            />
          )}
          <BoardStatusLine table={table} interaction={interaction} />
          <DiceRollNotice
            campaignId={campaign.id}
            openTables={openTables}
            presence={table?.presence ?? null}
            roomLayout={roomLayout}
            clock={props.diceClock}
          />
          <FocusToggle roomLayout={roomLayout} />
          {focus && table && (
            <TurnLine
              board={table.board}
              interaction={interaction}
              className="absolute top-3 left-1/2 -translate-x-1/2 bg-panel px-3 py-1"
            />
          )}
          {!focus && (
            <RoomToolbar
              board={table?.board ?? null}
              presence={table?.presence ?? null}
              interaction={interaction}
              renderer={renderer}
              role={role}
              auraMotion={props.auraMotion}
              onConfigure={() => setSceneDialog(true)}
              onNewToken={() => setTokenDialog({ tokenId: null })}
            />
          )}
          {sceneDialog && table && (
            <RoomSceneDialog
              campaignId={campaign.id}
              table={table}
              commands={props.boardCommands}
              assets={props.assets}
              onClose={() => setSceneDialog(false)}
            />
          )}
          {tokenDialog && table && (
            <RoomTokenDialog
              scope={scopeOf()}
              table={table}
              tokenId={tokenDialog.tokenId}
              renderer={renderer}
              interaction={interaction}
              commands={props.boardCommands}
              assets={props.assets}
              onClose={() => setTokenDialog(null)}
            />
          )}
          {!focus && (
            <RoomSidePanel
              roomLayout={roomLayout}
              table={table}
              interaction={interaction}
              group={shown.group}
              isMaster={isMaster}
              ownerId={campaign.ownerId}
              onEditToken={(tokenId) => setTokenDialog({ tokenId })}
              clock={props.interactionClock}
              dice={{
                campaignId: campaign.id,
                role,
                sessionStore: props.sessionStore,
                openTables,
                services: {
                  dice: props.dice,
                  savedRolls: props.savedRolls,
                  diceClock: props.diceClock,
                },
              }}
            />
          )}
        </div>
      </div>
    </RoomContexts>
  );
}

type ShownTab = Readonly<{
  /** The open table with the board of the tab shown (or the opening view, or `full`). */
  view: OpenTableView;
  table: Readonly<{
    presence: StoreApi<TablePresenceStore>;
    board: StoreApi<BoardStore>;
    cast: StoreApi<BoardStore>;
    edits: StoreApi<TableEditStore>;
  }> | null;
  interaction: StoreApi<BoardInteractionStore>;
  scopeOf: () => BoardScope;
  tabs: StoreApi<SceneTabsStore> | null;
  /** Changes with the tab shown: the canvas mounts again for another grid. */
  key: string;
  /** The others' pings on the grid shown. */
  pings: PingFeed | null;
  group: Readonly<{
    board: StoreApi<BoardStore>;
    interaction: StoreApi<BoardInteractionStore>;
  }> | null;
}>;

// The stores of the grid tab shown; until the table opens (and its tabs with it) a blank
// interaction stands in, with no grid to send to.
function useShownTab(
  campaignId: string,
  opened: OpenTableView,
  commands: TableBoardCommands,
): ShownTab {
  const [opening] = useState(() => ({
    interaction: createBoardInteractionStore({
      scopeOf: () => ({ campaignId, sceneId: '' }),
      commands,
      describeRefusal: tokenCommandFailureMessage,
    }),
    scopeOf: (): BoardScope => ({ campaignId, sceneId: '' }),
  }));
  const tabs = opened.kind === 'open' ? opened.tabs : null;
  const tab = useSceneTabOf(tabs, visibleTabOf);
  const group = useSceneTabOf(tabs, groupTabOf);
  return useMemo(() => {
    const view = opened.kind === 'open' && tab ? { ...opened, board: tab.board } : opened;
    const table = view.kind === 'open' ? { ...view, edits: tab?.edits ?? view.edits } : null;
    const interaction = tab?.interaction ?? opening.interaction;
    const scopeOf = tab?.scopeOf ?? opening.scopeOf;
    const key = tab?.key ?? GROUP_TAB;
    return { view, table, interaction, scopeOf, tabs, key, group, pings: tab?.pings ?? null };
  }, [opened, tab, tabs, group, opening]);
}

type RoomSceneDialogProps = Readonly<{
  campaignId: string;
  table: Readonly<{ presence: StoreApi<TablePresenceStore>; board: StoreApi<BoardStore> }>;
  commands: TableBoardCommands;
  assets: AssetsApi;
  onClose: () => void;
}>;

// "Configurar cena" over the confirmed scene; while reconnecting it opens but cannot send.
function RoomSceneDialog({ campaignId, table, commands, assets, onClose }: RoomSceneDialogProps) {
  const scene = useBoard(table.board, (state) => state.board?.scene ?? null);
  const live = useTablePresence(table.presence, (state) => state.status === 'live');
  if (!scene) return null;
  return (
    <ConfigureSceneDialog
      scope={{ campaignId, sceneId: scene.id }}
      scene={scene}
      commands={commands}
      assets={assets}
      connected={live}
      onClose={onClose}
    />
  );
}

type RoomToolbarProps = Omit<BoardToolbarProps, 'sightOn' | 'members'> &
  Readonly<{
    board: StoreApi<BoardStore> | null;
    presence: StoreApi<TablePresenceStore> | null;
  }>;

// The toolbar before the table opens has no scene to preview; once it does, Escuro and Luz do dia
// give the master "Ver como os selecionados".
function RoomToolbar({ board, presence, ...toolbar }: RoomToolbarProps): React.JSX.Element {
  if (!board || !presence) return <BoardToolbar {...toolbar} />;
  return <TableToolbar board={board} presence={presence} {...toolbar} />;
}

function TableToolbar({
  board,
  presence,
  ...toolbar
}: Omit<BoardToolbarProps, 'sightOn' | 'members'> &
  Readonly<{ board: StoreApi<BoardStore>; presence: StoreApi<TablePresenceStore> }>) {
  const vision = useBoard(board, (state) => state.board?.scene.vision);
  const members = useTablePresence(presence, (state) => state.members);
  const sightOn = vision === 'dark' || vision === 'daylight';
  return <BoardToolbar {...toolbar} members={members} sightOn={sightOn} />;
}
