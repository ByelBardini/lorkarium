import { RoomImagePresentation } from '@/features/library/room-image-presentation';
import { RoomDocumentSurface } from '@/features/documents/room-document-surface';
import {
  useDocumentWorkspaceSlice,
  type DocumentWorkspaceStore,
} from '@/stores/document-workspace-store';
import { cn } from '@/lib/utils';
import { isDesktopShell } from '@/lib/desktop-shell';
import type { CampaignDetailDto } from '@lorkarium/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { useOpenTable, type OpenTableView } from '@/features/sessions/use-open-table';
import { useOpenTableOf } from '@/features/chat/use-chat-people';
import { useSpeechBalloons } from '@/features/chat/use-speech-balloons';
import { RoomChat } from '@/features/chat/room-chat';
import type { ChatAttention } from '@/features/chat/chat-attention-watch';
import { useRoomDiceWindow } from '@/features/dice/use-room-dice-window';
import { ApplyConditionDialog } from '@/features/combat/apply-condition-dialog';
import { ConditionToolPanel } from '@/features/combat/condition-tool-panel';
import { useConditionToolFollow } from '@/features/combat/use-condition-tool-follow';
import { TurnLine } from '@/features/combat/turn-line';
import {
  RoomTokenAuraDialog,
  RoomTokenDialog,
  RoomTokenImageDialog,
} from '@/features/tokens/room-token-dialog';
import { CharacterLinkDialog, type CharacterLinkRequest } from '@/features/tokens/token-link-items';
import type { BoardRenderer, CreateBoardRenderer } from '@/renderer/board-renderer';
import type { RoomAssetsApi } from '@/services/assets-api';
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
import type { DiceRendererFactory } from '@lorkarium/dice-renderer';
import type { DiceSoundFactory } from '@/dice-audio/dice-sound';
import type { ChatSoundFactory } from '@/chat-audio/chat-sound';
import type { ChatPreferencesStore } from '@/stores/chat-preferences-store';
import { useDiceOverlay } from '@/features/dice/use-dice-overlay';
import { useDiceSound } from '@/features/dice/use-dice-sound';
import { DiceRollNotice } from '@/features/dice/dice-roll-notice';
import type { DicePreferencesStore } from '@/stores/dice-preferences-store';
import type { DiceCommands } from '@/services/dice-commands';
import type { SavedRollsApi } from '@/services/saved-rolls-api';
import type { ChatCommands } from '@/services/chat-commands';
import type { ChatWindowHost } from '@/services/chat-window-host';
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
import type { BoardStore } from '@/stores/board-store';
import type { CharactersStore } from '@/stores/characters-store';
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
import type { TablePresenceStore } from '@/stores/table-presence-store';
import { BoardArea } from './board-area';
import { DeleteSelectionDialog, type SelectionToDelete } from './delete-selection-dialog';
import { tokenCommandFailureMessage } from './board-messages';
import { BoardStatusLine } from './board-status-line';
import { RoomToolbar } from './room-toolbar';
import { RoomSceneDialog } from './room-scene-dialog';
import { useBoardPause } from './use-board-pause';
import { FocusToggle } from './focus-toggle';
import { TokenContextMenu, type TokenMenuRequest } from './token-context-menu';
import { HoverCardLayer, type HoverCardLayerHandle } from './hover-card-layer';
import type { TokenHoverRequest } from './use-token-hover';
import { RoomHeader } from './room-header';
import { RoomSidePanel } from './room-panel';
import { useInteractionFollowsTable } from './use-interaction-follows-table';
import { usePlayerIdsOf } from './table-players';
import { useRoomSightOutlines } from './table-sight-outlines';
import { RoomContexts } from './room-contexts';
import { useRoomTokenKeys } from './table-token-rights';
import { useViewerRole } from './use-viewer-role';
import { useBoardPings } from './use-board-pings';
import { useEditShortcuts } from './use-edit-shortcuts';
import { useRoomShortcuts } from './use-room-shortcuts';
import { RoomPatrolPanel } from '@/features/tokens/patrol-panel';
import { useRoomPatrolEditor } from '@/features/tokens/use-room-patrol-editor';

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
  assets: RoomAssetsApi;
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
  /** The chat at the foot of the board: `chat:send` (the rest it shares with "Dados"). */
  chat: ChatCommands;
  chatWindowHost: ChatWindowHost;
  /** "Som do chat": a mention or a whisper to the viewer rings. */
  chatPreferences: StoreApi<ChatPreferencesStore>;
  createChatSound: ChatSoundFactory;
  /** The desktop app's taskbar button, lit for chat messages not seen; `null` in the browser. */
  chatAttention: ChatAttention | null;
  documentWorkspace?: StoreApi<DocumentWorkspaceStore>;
  /** A page (settings, conditions) covers the room: the desktop title bar gets its place back. */
  covered?: boolean;
}>;
// `{ tokenId: null }` is "Novo token"; a token id is "Editar token", on `initialTab` when given.
type TokenDialogRequest = Readonly<{ tokenId: string | null; initialTab?: 'forms' }>;

/** The play room: the board fills the screen, the top bar, tools and panel float over it, and
 *  focus mode (F, Esc) leaves the board alone. Opens the table among the tab's open tables; the
 *  board, the tools, the tracker and the token dock follow the grid tab shown ("Na mesa" stays
 *  on the group grid). A spectator (`campaign.myRole`) only watches: no edit tool, key, ping or
 *  token menu, and every command stops at `readOnly`; a role changed live is followed.
 *
 *  Example: `<PlayRoomPage key={campaign.id} campaign={campaign} openTables={deps.openTables} roomLayout={deps.roomLayout} clipboard={deps.clipboard} createBoardRenderer={deps.createBoardRenderer} />` */
export function PlayRoomPage(props: PlayRoomPageProps): React.JSX.Element {
  const { campaign, openTables, roomLayout, clipboard } = props;
  const activeDocument = useDocumentWorkspaceSlice(
    props.documentWorkspace,
    (state) => state.activeByCampaign[campaign.id] ?? null,
    null,
  );
  const opened = useOpenTable(campaign, openTables);
  const shown = useShownTab(campaign.id, opened, props.boardCommands);
  const { view, table, interaction, scopeOf } = shown;
  const [renderer, setRenderer] = useState<BoardRenderer | null>(null);
  const [sceneDialog, setSceneDialog] = useState(false);
  const [tokenDialog, setTokenDialog] = useState<TokenDialogRequest | null>(null);
  const [tokenMenu, setTokenMenu] = useState<TokenMenuRequest | null>(null);
  const [doorMenu, setDoorMenu] = useState<DoorMenuRequest | null>(null);
  const [lightMenu, setLightMenu] = useState<LightMenuRequest | null>(null);
  const [conditionTargets, setConditionTargets] = useState<readonly string[] | null>(null);
  const [imageTokenId, setImageTokenId] = useState<string | null>(null);
  const [auraTokenId, setAuraTokenId] = useState<string | null>(null);
  const [deletion, setDeletion] = useState<SelectionToDelete | null>(null);
  const [characterLink, setCharacterLink] = useState<CharacterLinkRequest | null>(null);
  const [conditionTool] = useState(createConditionToolStore);
  const role = campaign.myRole;
  const isMaster = role === 'master';
  // The hover lives in its own layer: resting on a token never renders the room.
  const hoverLayer = useRef<HoverCardLayerHandle>(null);
  const onTokenHover = useCallback(
    (request: TokenHoverRequest | null) => hoverLayer.current?.onTokenHover(request),
    [],
  );
  useEffect(() => interaction.getState().allowLayerChoice(isMaster), [interaction, isMaster]);
  const focus = useRoomLayout(roomLayout, (state) => state.focus);
  useBoardPause(renderer, !!activeDocument);
  useRoomShortcuts({ roomLayout, interaction, role, enabled: !activeDocument });
  const { dicePreferences, createDiceRenderer, createDiceSound } = props;
  useDiceOverlay({ campaignId: campaign.id, openTables, dicePreferences, createDiceRenderer });
  useDiceSound({ campaignId: campaign.id, openTables, dicePreferences, createDiceSound });
  const sightOutlines = useRoomSightOutlines(
    props.assets,
    table?.board ?? null,
    shown.group?.board ?? null,
  );
  useInteractionFollowsTable(table, interaction, role, sightOutlines);
  useViewerRole(table && shown.tabs ? { ...table, tabs: shown.tabs } : null, props.sessionStore);
  const players = usePlayerIdsOf(table?.presence ?? null);
  const commands = props.boardCommands;
  const board = table?.board ?? null;
  const patrol = useRoomPatrolEditor({ commands, board, interaction, scopeOf });
  const tokenKeys = useRoomTokenKeys(openTables, campaign);
  useEditShortcuts({
    scopeOf,
    table: activeDocument ? null : table,
    interaction,
    commands,
    role,
    tokenKeys,
  });
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
  const speechSceneOf = useCallback(() => scopeOf().sceneId, [scopeOf]);
  const openTable = useOpenTableOf(openTables, campaign.id);
  const chat = openTable?.chat ?? null;
  useSpeechBalloons({ renderer, chat, sceneIdOf: speechSceneOf });
  const tablePanels = {
    campaignId: campaign.id,
    role,
    sessionStore: props.sessionStore,
    openTables,
    presence: table?.presence ?? null,
    board: table?.board ?? null,
    services: props,
  };
  const diceWindow = useRoomDiceWindow(tablePanels, props.chatWindowHost);
  return (
    <RoomContexts players={players} tokenKeys={tokenKeys} sightOutlines={sightOutlines}>
      {openTable?.imagePresentation && (
        <RoomImagePresentation
          store={openTable.imagePresentation}
          host={props.chatWindowHost}
          isDesktop={isDesktopShell(navigator.userAgent)}
        />
      )}
      {diceWindow.portal}
      {/* clip, not hidden: a hidden box still scrolls when a focus inside reaches past its edge */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-clip bg-panel">
        {(!focus || !!activeDocument) && (
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
            documentWorkspace={props.documentWorkspace}
          />
        )}
        <div className="relative min-h-0 flex-1">
          <div
            className={cn('absolute inset-0', activeDocument && 'invisible')}
            inert={!!activeDocument}
            aria-hidden={activeDocument ? true : undefined}
          >
            <BoardArea
              tabKey={shown.key}
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
                onTokenHover(null);
                if (!watchesOnly(role)) setTokenMenu(request);
              }}
              onTokenHover={onTokenHover}
              onDoorMenu={(request) => isMaster && setDoorMenu(request)}
              onLightMenu={(request) => isMaster && setLightMenu(request)}
              drawingStyle={props.drawingStyle}
              effectAreaStyle={props.effectAreaStyle}
              wallStyle={props.wallStyle}
              lightReach={props.lightReach}
              lightColor={props.lightColor}
              conditionTool={conditionTool}
              onPing={ping}
              clock={props.interactionClock}
              patrolEditor={patrol.editor}
            />
            {tool === 'draw' && !focus && (
              <DrawStylePanel
                drawingStyle={props.drawingStyle}
                mode={drawMode}
                onMode={interaction.getState().setDrawMode}
              />
            )}
            {table && <RoomPatrolPanel editor={patrol.editor} presence={table.presence} />}
            {tool === 'area' && !focus && (
              <EffectAreaPanel effectAreaStyle={props.effectAreaStyle} />
            )}
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
            <HoverCardLayer
              ref={hoverLayer}
              clock={props.interactionClock}
              board={table?.board ?? null}
              interaction={interaction}
            />
            {tokenMenu && table && (
              <TokenContextMenu
                request={tokenMenu}
                board={table.board}
                interaction={interaction}
                onApplyCondition={setConditionTargets}
                onChangeImage={setImageTokenId}
                onChangeAura={setAuraTokenId}
                onEditForms={(tokenId) => setTokenDialog({ tokenId, initialTab: 'forms' })}
                onEditToken={(tokenId) => setTokenDialog({ tokenId })}
                onEditPatrol={patrol.open}
                characters={{ store: table.characters, onConfirmLink: setCharacterLink }}
                onClose={() => setTokenMenu(null)}
              />
            )}
            {characterLink && (
              <CharacterLinkDialog
                request={characterLink}
                interaction={interaction}
                onClose={() => setCharacterLink(null)}
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
            <RoomChat
              tableName={campaign.name}
              panel={tablePanels}
              roomLayout={roomLayout}
              services={props}
              onScreen={!props.covered}
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
                {...tokenDialog}
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
                diceWindow={diceWindow.slot}
              />
            )}
          </div>
          <RoomDocumentSurface workspace={props.documentWorkspace} activeKey={activeDocument} />
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
    characters: StoreApi<CharactersStore>;
    edits: StoreApi<TableEditStore>;
  }> | null;
  interaction: StoreApi<BoardInteractionStore>;
  scopeOf: () => BoardScope;
  tabs: StoreApi<SceneTabsStore> | null;
  /** Changes with the tab shown: the same canvas shows another grid, at that tab's camera. */
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
