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
  type RemoveCombatantCommandDto,
  type SetInitiativeCommandDto,
  type StartCombatCommandDto,
  type TurnCommandDto,
} from './combat.dto';
import {
  conditionDefinitionDto,
  type ApplyConditionCommandDto,
  type ConditionAppliedDto,
  type ConditionDefinedDto,
  type ConditionRemovedDto,
  type DefineConditionCommandDto,
  type RemoveConditionCommandDto,
} from './condition.dto';
import { sceneDto, type ConfigureSceneCommandDto } from './scene.dto';
import {
  tokenDto,
  type AdjustBarCommandDto,
  type CreateTokenCommandDto,
  type DeleteTokenCommandDto,
  type DragTokenCommandDto,
  type MoveTokenCommandDto,
  type TokenCreatedDto,
  type TokenDeletedDto,
  type TokenDraggedDto,
  type TokenMovedDto,
  type TokenUpdatedDto,
  type UpdateTokenCommandDto,
} from './token.dto';

/** Board command and event names (spec §7.2). */
export const BOARD_EVENTS = {
  sync: 'board:sync',
  configureScene: 'scene:configure',
  sceneUpdated: 'scene:updated',
  createToken: 'token:create',
  updateToken: 'token:update',
  moveToken: 'token:move',
  dragToken: 'token:drag',
  adjustBar: 'token:adjustBar',
  deleteToken: 'token:delete',
  tokenCreated: 'token:created',
  tokenUpdated: 'token:updated',
  tokenMoved: 'token:moved',
  tokenDragged: 'token:dragged',
  tokenDeleted: 'token:deleted',
  defineCondition: 'condition:define',
  applyCondition: 'condition:apply',
  removeCondition: 'condition:remove',
  conditionDefined: 'condition:defined',
  conditionApplied: 'condition:applied',
  conditionRemoved: 'condition:removed',
  startCombat: 'combat:start',
  endCombat: 'combat:end',
  addCombatants: 'combat:addCombatants',
  removeCombatant: 'combat:removeCombatant',
  moveInTie: 'combat:moveInTie',
  setInitiative: 'combat:setInitiative',
  nextTurn: 'combat:nextTurn',
  previousTurn: 'combat:previousTurn',
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
  combat: combatDto.nullable(),
  conditionDefinitions: z.array(conditionDefinitionDto),
});

export type BoardStateDto = z.infer<typeof boardStateDto>;

/** Answer to `board:sync`: the redacted snapshot or the API error. */
export const boardSyncAckDto = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), state: boardStateDto }),
  realtimeAckFailureDto,
]);

export type BoardSyncAckDto = z.infer<typeof boardSyncAckDto>;

/** Answer to every board mutation: the version it produced, or the API error. */
export const boardCommandAckDto = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), version: stateVersionDto }),
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
  'token:update': Command<UpdateTokenCommandDto>;
  'token:move': Command<MoveTokenCommandDto>;
  'token:drag': Command<DragTokenCommandDto>;
  'token:adjustBar': Command<AdjustBarCommandDto>;
  'token:delete': Command<DeleteTokenCommandDto>;
  'condition:define': Command<DefineConditionCommandDto>;
  'condition:apply': Command<ApplyConditionCommandDto>;
  'condition:remove': Command<RemoveConditionCommandDto>;
  'combat:start': Command<StartCombatCommandDto>;
  'combat:end': Command<EndCombatCommandDto>;
  'combat:addCombatants': Command<AddCombatantsCommandDto>;
  'combat:removeCombatant': Command<RemoveCombatantCommandDto>;
  'combat:moveInTie': Command<MoveInTieCommandDto>;
  'combat:setInitiative': Command<SetInitiativeCommandDto>;
  'combat:nextTurn': Command<TurnCommandDto>;
  'combat:previousTurn': Command<TurnCommandDto>;
};

/** Server → room board events, for the Socket.IO generics on both ends. */
export type BoardServerEvents = {
  'scene:updated': (event: SceneUpdatedDto) => void;
  'token:created': (event: TokenCreatedDto) => void;
  'token:updated': (event: TokenUpdatedDto) => void;
  'token:moved': (event: TokenMovedDto) => void;
  'token:dragged': (event: TokenDraggedDto) => void;
  'token:deleted': (event: TokenDeletedDto) => void;
  'condition:defined': (event: ConditionDefinedDto) => void;
  'condition:applied': (event: ConditionAppliedDto) => void;
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
