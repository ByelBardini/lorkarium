import { z } from 'zod';
import { campaignRoleDto } from '../campaigns/campaign.dto';
import { realtimeAckFailureDto, stateVersionDto } from '../http/realtime-ack.dto';
import type { SessionClientEvents, SessionServerEvents } from '../sessions/session.dto';
import { boardCommandShape, boardEventShape } from './board-event.dto';
import {
  combatDto,
  type AddCombatantsCommandDto,
  type CombatEndedDto,
  type CombatStartedDto,
  type CombatTurnChangedDto,
  type CombatUpdatedDto,
  type EndCombatCommandDto,
  type MoveInTieCommandDto,
  type RegroupTokensCommandDto,
  type RemoveCombatantCommandDto,
  type RenameCombatantCommandDto,
  type SetInitiativeCommandDto,
  type StartCombatCommandDto,
  type TurnCommandDto,
} from './combat.dto';
import {
  conditionDefinitionDto,
  type ApplyConditionCommandDto,
  type ApplyConditionsCommandDto,
  type ConditionAppliedDto,
  type ConditionsAppliedDto,
  type ConditionDefinedDto,
  type ConditionRemovedDto,
  type DefineConditionCommandDto,
  type RemoveConditionCommandDto,
  type SetConditionRoundsCommandDto,
} from './condition.dto';
import { effectAreaDto } from './effect-area.dto';
import {
  drawingDto,
  type CreateDrawingsCommandDto,
  type DeleteDrawingsCommandDto,
  type DrawingsCreatedDto,
  type DrawingsDeletedDto,
  type DrawingsMovedDto,
  type MoveDrawingsCommandDto,
} from './drawing.dto';
import type {
  CreateEffectAreasCommandDto,
  DeleteEffectAreasCommandDto,
  EffectAreasCreatedDto,
  EffectAreasDeletedDto,
  EffectAreasReshapedDto,
  ReshapeEffectAreasCommandDto,
} from './effect-area.dto';
import {
  lightDto,
  type CreateLightsCommandDto,
  type DeleteLightsCommandDto,
  type LightColorsChangedDto,
  type LightConesChangedDto,
  type LightRangesChangedDto,
  type LightsCreatedDto,
  type LightsDeletedDto,
  type LightsLitChangedDto,
  type LightsMovedDto,
  type MoveLightsCommandDto,
  type SetLightColorsCommandDto,
  type SetLightConesCommandDto,
  type SetLightRangesCommandDto,
  type SetLightsLitCommandDto,
} from './light.dto';
import { sceneDto, type ConfigureSceneCommandDto } from './scene.dto';
import {
  wallDto,
  type CreateWallsCommandDto,
  type DeleteWallsCommandDto,
  type DoorChangedDto,
  type EraseWallAreaCommandDto,
  type EraseWallSegmentCommandDto,
  type WallAreaErasedDto,
  type WallSegmentErasedDto,
  type MoveWallsCommandDto,
  type SetDoorCommandDto,
  type SetWallKindsCommandDto,
  type WallKindsChangedDto,
  type WallsCreatedDto,
  type WallsDeletedDto,
  type WallsMovedDto,
} from './wall.dto';
import {
  tokenDto,
  type AdjustBarCommandDto,
  type CreateTokenCommandDto,
  type DeleteTokenCommandDto,
  type MoveTokenCommandDto,
  type TokenCreatedDto,
  type TokenDeletedDto,
  type TokenMovedDto,
  type TokenUpdatedDto,
  type UpdateTokenCommandDto,
} from './token.dto';
import type {
  FaceTokensCommandDto,
  RestyleTokensCommandDto,
  TokensFacedDto,
  TokensRestyledDto,
} from './token-appearance.dto';
import {
  mainTokenDto,
  type MainTokenChangedDto,
  type SetMainTokenCommandDto,
} from './token-main.dto';
import {
  memberCardDto,
  type MemberCardChangedDto,
  type UpdateMemberCardCommandDto,
} from './member-card.dto';
import type { ResizeTokensCommandDto, TokensResizedDto } from './token-resize.dto';
import type {
  CreateTokensCommandDto,
  DeleteTokensCommandDto,
  DragTokensCommandDto,
  MoveTokensCommandDto,
  SetTokenLayerCommandDto,
  TokenLayerChangedDto,
  TokensCreatedDto,
  TokensDeletedDto,
  TokensDraggedDto,
  TokensMovedDto,
} from './token-group.dto';

/** Board command and event names (spec §7.2). */
export const BOARD_EVENTS = {
  sync: 'board:sync',
  configureScene: 'scene:configure',
  sceneUpdated: 'scene:updated',
  createToken: 'token:create',
  createTokens: 'token:createMany',
  updateToken: 'token:update',
  moveToken: 'token:move',
  moveTokens: 'token:moveMany',
  dragTokens: 'token:dragMany',
  setTokenLayer: 'token:setLayer',
  faceTokens: 'token:faceMany',
  restyleTokens: 'token:restyleMany',
  resizeTokens: 'token:resizeMany',
  adjustBar: 'token:adjustBar',
  setMainToken: 'token:setMain',
  deleteToken: 'token:delete',
  deleteTokens: 'token:deleteMany',
  tokenCreated: 'token:created',
  tokensCreated: 'token:createdMany',
  tokenUpdated: 'token:updated',
  tokenMoved: 'token:moved',
  tokensMoved: 'token:movedMany',
  tokensDragged: 'token:draggedMany',
  tokenLayerChanged: 'token:layerChanged',
  tokensFaced: 'token:facedMany',
  tokensRestyled: 'token:restyledMany',
  tokensResized: 'token:resizedMany',
  tokenDeleted: 'token:deleted',
  tokensDeleted: 'token:deletedMany',
  mainTokenChanged: 'token:mainChanged',
  updateMemberCard: 'member:updateCard',
  memberCardChanged: 'member:cardChanged',
  createDrawings: 'drawing:createMany',
  moveDrawings: 'drawing:moveMany',
  deleteDrawings: 'drawing:deleteMany',
  drawingsCreated: 'drawing:createdMany',
  drawingsMoved: 'drawing:movedMany',
  drawingsDeleted: 'drawing:deletedMany',
  createEffectAreas: 'effectArea:createMany',
  reshapeEffectAreas: 'effectArea:reshapeMany',
  deleteEffectAreas: 'effectArea:deleteMany',
  effectAreasCreated: 'effectArea:createdMany',
  effectAreasReshaped: 'effectArea:reshapedMany',
  effectAreasDeleted: 'effectArea:deletedMany',
  createWalls: 'wall:createMany',
  moveWalls: 'wall:moveMany',
  deleteWalls: 'wall:deleteMany',
  setWallKinds: 'wall:setKindMany',
  setDoor: 'wall:setDoor',
  eraseWallSegment: 'wall:eraseSegment',
  wallSegmentErased: 'wall:segmentErased',
  eraseWallArea: 'wall:eraseArea',
  wallAreaErased: 'wall:areaErased',
  wallsCreated: 'wall:createdMany',
  wallsMoved: 'wall:movedMany',
  wallsDeleted: 'wall:deletedMany',
  wallKindsChanged: 'wall:kindsChanged',
  doorChanged: 'wall:doorChanged',
  createLights: 'light:createMany',
  moveLights: 'light:moveMany',
  setLightRanges: 'light:setRangeMany',
  setLightColors: 'light:setColorMany',
  setLightCones: 'light:setConeMany',
  setLightsLit: 'light:setLitMany',
  deleteLights: 'light:deleteMany',
  lightsCreated: 'light:createdMany',
  lightsMoved: 'light:movedMany',
  lightRangesChanged: 'light:rangesChanged',
  lightColorsChanged: 'light:colorsChanged',
  lightConesChanged: 'light:conesChanged',
  lightsLitChanged: 'light:litChanged',
  lightsDeleted: 'light:deletedMany',
  defineCondition: 'condition:define',
  applyCondition: 'condition:apply',
  applyConditions: 'condition:applyMany',
  removeCondition: 'condition:remove',
  setConditionRounds: 'condition:setRounds',
  conditionDefined: 'condition:defined',
  conditionApplied: 'condition:applied',
  conditionsApplied: 'condition:appliedMany',
  conditionRemoved: 'condition:removed',
  startCombat: 'combat:start',
  endCombat: 'combat:end',
  addCombatants: 'combat:addCombatants',
  removeCombatant: 'combat:removeCombatant',
  moveInTie: 'combat:moveInTie',
  setInitiative: 'combat:setInitiative',
  nextTurn: 'combat:nextTurn',
  previousTurn: 'combat:previousTurn',
  regroupTokens: 'combat:regroupTokens',
  renameCombatant: 'combat:renameCombatant',
  combatStarted: 'combat:started',
  combatUpdated: 'combat:updated',
  combatTurnChanged: 'combat:turnChanged',
  combatEnded: 'combat:ended',
} as const;

/** Base of every board command and the payload of `board:sync`; who asks comes from the
 *  connection, never from here (§7.3).
 *
 *  Example: `boardCommandDto.parse({ actionId: crypto.randomUUID(), campaignId })` */
export const boardCommandDto = z.strictObject(boardCommandShape);

export type BoardCommandDto = z.infer<typeof boardCommandDto>;

/** Who the snapshot was redacted for. */
export const boardViewerDto = z.strictObject({ userId: z.uuid(), role: campaignRoleDto });

export type BoardViewerDto = z.infer<typeof boardViewerDto>;

/** The whole board as one viewer may see it; answer to `board:sync`.
 *
 *  Example: `boardStateDto.parse(ack.state).scene.widthCells` */
export const boardStateDto = z.strictObject({
  campaignId: z.uuid(),
  version: stateVersionDto,
  at: z.iso.datetime(),
  viewer: boardViewerDto,
  scene: sceneDto,
  tokens: z.array(tokenDto),
  drawings: z.array(drawingDto),
  effectAreas: z.array(effectAreaDto),
  walls: z.array(wallDto),
  lights: z.array(lightDto),
  combat: combatDto.nullable(),
  conditionDefinitions: z.array(conditionDefinitionDto),
  mainTokens: z.array(mainTokenDto),
  /** Only the cards someone wrote on; a member without one has an empty card. */
  memberCards: z.array(memberCardDto),
});

export type BoardStateDto = z.infer<typeof boardStateDto>;

/** Answer to `board:sync`: the redacted snapshot or the API error. */
export const boardSyncAckDto = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), state: boardStateDto }),
  realtimeAckFailureDto,
]);

export type BoardSyncAckDto = z.infer<typeof boardSyncAckDto>;

/** Answer to every board mutation: the version it produced, or the API error. A command that
 *  creates (`token:createMany`, `drawing:createMany`, `effectArea:createMany`, `wall:createMany`, `wall:eraseSegment`, `wall:eraseArea`, `light:createMany`)
 *  also names the ids it gave, in the order sent: undoing it, or remapping an undo stack after re-creating, needs them. */
export const boardCommandAckDto = z.discriminatedUnion('ok', [
  z.strictObject({
    ok: z.literal(true),
    version: stateVersionDto,
    createdIds: z.array(z.uuid()).optional(),
  }),
  realtimeAckFailureDto,
]);

export type BoardCommandAckDto = z.infer<typeof boardCommandAckDto>;

export const sceneUpdatedDto = z.strictObject({ ...boardEventShape, scene: sceneDto });

export type SceneUpdatedDto = z.infer<typeof sceneUpdatedDto>;

type BoardAck<Answer> = (answer: Answer) => void;
type Command<Payload> = (command: Payload, ack: BoardAck<BoardCommandAckDto>) => void;

/** Client → server board events, for the Socket.IO generics on both ends. */
export type BoardClientEvents = {
  'board:sync': (command: BoardCommandDto, ack: BoardAck<BoardSyncAckDto>) => void;
  'scene:configure': Command<ConfigureSceneCommandDto>;
  'token:create': Command<CreateTokenCommandDto>;
  'token:createMany': Command<CreateTokensCommandDto>;
  'token:update': Command<UpdateTokenCommandDto>;
  'token:move': Command<MoveTokenCommandDto>;
  'token:moveMany': Command<MoveTokensCommandDto>;
  'token:dragMany': Command<DragTokensCommandDto>;
  'token:setLayer': Command<SetTokenLayerCommandDto>;
  'token:faceMany': Command<FaceTokensCommandDto>;
  'token:restyleMany': Command<RestyleTokensCommandDto>;
  'token:resizeMany': Command<ResizeTokensCommandDto>;
  'token:adjustBar': Command<AdjustBarCommandDto>;
  'token:setMain': Command<SetMainTokenCommandDto>;
  'member:updateCard': Command<UpdateMemberCardCommandDto>;
  'token:delete': Command<DeleteTokenCommandDto>;
  'token:deleteMany': Command<DeleteTokensCommandDto>;
  'drawing:createMany': Command<CreateDrawingsCommandDto>;
  'drawing:moveMany': Command<MoveDrawingsCommandDto>;
  'drawing:deleteMany': Command<DeleteDrawingsCommandDto>;
  'effectArea:createMany': Command<CreateEffectAreasCommandDto>;
  'effectArea:reshapeMany': Command<ReshapeEffectAreasCommandDto>;
  'effectArea:deleteMany': Command<DeleteEffectAreasCommandDto>;
  'wall:createMany': Command<CreateWallsCommandDto>;
  'wall:moveMany': Command<MoveWallsCommandDto>;
  'wall:deleteMany': Command<DeleteWallsCommandDto>;
  'wall:setKindMany': Command<SetWallKindsCommandDto>;
  'wall:setDoor': Command<SetDoorCommandDto>;
  'wall:eraseSegment': Command<EraseWallSegmentCommandDto>;
  'wall:eraseArea': Command<EraseWallAreaCommandDto>;
  'light:createMany': Command<CreateLightsCommandDto>;
  'light:moveMany': Command<MoveLightsCommandDto>;
  'light:setRangeMany': Command<SetLightRangesCommandDto>;
  'light:setColorMany': Command<SetLightColorsCommandDto>;
  'light:setConeMany': Command<SetLightConesCommandDto>;
  'light:setLitMany': Command<SetLightsLitCommandDto>;
  'light:deleteMany': Command<DeleteLightsCommandDto>;
  'condition:define': Command<DefineConditionCommandDto>;
  'condition:apply': Command<ApplyConditionCommandDto>;
  'condition:applyMany': Command<ApplyConditionsCommandDto>;
  'condition:remove': Command<RemoveConditionCommandDto>;
  'condition:setRounds': Command<SetConditionRoundsCommandDto>;
  'combat:start': Command<StartCombatCommandDto>;
  'combat:end': Command<EndCombatCommandDto>;
  'combat:addCombatants': Command<AddCombatantsCommandDto>;
  'combat:removeCombatant': Command<RemoveCombatantCommandDto>;
  'combat:moveInTie': Command<MoveInTieCommandDto>;
  'combat:setInitiative': Command<SetInitiativeCommandDto>;
  'combat:nextTurn': Command<TurnCommandDto>;
  'combat:previousTurn': Command<TurnCommandDto>;
  'combat:regroupTokens': Command<RegroupTokensCommandDto>;
  'combat:renameCombatant': Command<RenameCombatantCommandDto>;
};

/** Server → room board events, for the Socket.IO generics on both ends. */
export type BoardServerEvents = {
  'scene:updated': (event: SceneUpdatedDto) => void;
  'token:created': (event: TokenCreatedDto) => void;
  'token:createdMany': (event: TokensCreatedDto) => void;
  'token:updated': (event: TokenUpdatedDto) => void;
  'token:moved': (event: TokenMovedDto) => void;
  'token:movedMany': (event: TokensMovedDto) => void;
  'token:draggedMany': (event: TokensDraggedDto) => void;
  'token:layerChanged': (event: TokenLayerChangedDto) => void;
  'token:facedMany': (event: TokensFacedDto) => void;
  'token:restyledMany': (event: TokensRestyledDto) => void;
  'token:resizedMany': (event: TokensResizedDto) => void;
  'token:deleted': (event: TokenDeletedDto) => void;
  'token:deletedMany': (event: TokensDeletedDto) => void;
  'token:mainChanged': (event: MainTokenChangedDto) => void;
  'member:cardChanged': (event: MemberCardChangedDto) => void;
  'drawing:createdMany': (event: DrawingsCreatedDto) => void;
  'drawing:movedMany': (event: DrawingsMovedDto) => void;
  'drawing:deletedMany': (event: DrawingsDeletedDto) => void;
  'effectArea:createdMany': (event: EffectAreasCreatedDto) => void;
  'effectArea:reshapedMany': (event: EffectAreasReshapedDto) => void;
  'effectArea:deletedMany': (event: EffectAreasDeletedDto) => void;
  'wall:createdMany': (event: WallsCreatedDto) => void;
  'wall:movedMany': (event: WallsMovedDto) => void;
  'wall:deletedMany': (event: WallsDeletedDto) => void;
  'wall:kindsChanged': (event: WallKindsChangedDto) => void;
  'wall:doorChanged': (event: DoorChangedDto) => void;
  'wall:segmentErased': (event: WallSegmentErasedDto) => void;
  'wall:areaErased': (event: WallAreaErasedDto) => void;
  'light:createdMany': (event: LightsCreatedDto) => void;
  'light:movedMany': (event: LightsMovedDto) => void;
  'light:rangesChanged': (event: LightRangesChangedDto) => void;
  'light:colorsChanged': (event: LightColorsChangedDto) => void;
  'light:conesChanged': (event: LightConesChangedDto) => void;
  'light:litChanged': (event: LightsLitChangedDto) => void;
  'light:deletedMany': (event: LightsDeletedDto) => void;
  'condition:defined': (event: ConditionDefinedDto) => void;
  'condition:applied': (event: ConditionAppliedDto) => void;
  'condition:appliedMany': (event: ConditionsAppliedDto) => void;
  'condition:removed': (event: ConditionRemovedDto) => void;
  'combat:started': (event: CombatStartedDto) => void;
  'combat:updated': (event: CombatUpdatedDto) => void;
  'combat:turnChanged': (event: CombatTurnChangedDto) => void;
  'combat:ended': (event: CombatEndedDto) => void;
};

/** Every client → server event of a table connection (session + board). */
export type TableClientEvents = SessionClientEvents & BoardClientEvents;

/** Every server → client event of a table connection (session + board). */
export type TableServerEvents = SessionServerEvents & BoardServerEvents;
