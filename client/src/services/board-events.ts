import {
  BOARD_EVENTS,
  combatEndedDto,
  combatStartedDto,
  combatTurnChangedDto,
  combatUpdatedDto,
  conditionAppliedDto,
  conditionDefinedDto,
  conditionRemovedDto,
  sceneUpdatedDto,
  tokenCreatedDto,
  tokenDeletedDto,
  tokenMovedDto,
  tokenUpdatedDto,
  type CombatEndedDto,
  type CombatStartedDto,
  type CombatTurnChangedDto,
  type CombatUpdatedDto,
  type ConditionAppliedDto,
  type ConditionDefinedDto,
  type ConditionRemovedDto,
  type SceneUpdatedDto,
  type TokenCreatedDto,
  type TokenDeletedDto,
  type TokenMovedDto,
  type TokenUpdatedDto,
} from '@lorkarium/contracts';
import type { z } from 'zod';

/** A board event of the open table, already validated by its DTO. */
export type BoardEvent =
  | Readonly<{ type: 'sceneUpdated'; payload: SceneUpdatedDto }>
  | Readonly<{ type: 'tokenCreated'; payload: TokenCreatedDto }>
  | Readonly<{ type: 'tokenUpdated'; payload: TokenUpdatedDto }>
  | Readonly<{ type: 'tokenMoved'; payload: TokenMovedDto }>
  | Readonly<{ type: 'tokenDeleted'; payload: TokenDeletedDto }>
  | Readonly<{ type: 'conditionDefined'; payload: ConditionDefinedDto }>
  | Readonly<{ type: 'conditionApplied'; payload: ConditionAppliedDto }>
  | Readonly<{ type: 'conditionRemoved'; payload: ConditionRemovedDto }>
  | Readonly<{ type: 'combatStarted'; payload: CombatStartedDto }>
  | Readonly<{ type: 'combatUpdated'; payload: CombatUpdatedDto }>
  | Readonly<{ type: 'combatTurnChanged'; payload: CombatTurnChangedDto }>
  | Readonly<{ type: 'combatEnded'; payload: CombatEndedDto }>;

export type BoardEventType = BoardEvent['type'];

type BoardEventSpec = Readonly<{
  build: (payload: unknown) => BoardEvent | null;
}>;

function specOf<T extends BoardEventType, P>(type: T, dto: z.ZodType<P>): BoardEventSpec {
  return {
    build: (payload) => {
      const parsed = dto.safeParse(payload);
      return parsed.success ? ({ type, payload: parsed.data } as BoardEvent) : null;
    },
  };
}

/** Every server → client board event, by Socket.IO name. */
export const BOARD_EVENT_SPECS: Readonly<Record<string, BoardEventSpec>> = {
  [BOARD_EVENTS.sceneUpdated]: specOf('sceneUpdated', sceneUpdatedDto),
  [BOARD_EVENTS.tokenCreated]: specOf('tokenCreated', tokenCreatedDto),
  [BOARD_EVENTS.tokenUpdated]: specOf('tokenUpdated', tokenUpdatedDto),
  [BOARD_EVENTS.tokenMoved]: specOf('tokenMoved', tokenMovedDto),
  [BOARD_EVENTS.tokenDeleted]: specOf('tokenDeleted', tokenDeletedDto),
  [BOARD_EVENTS.conditionDefined]: specOf('conditionDefined', conditionDefinedDto),
  [BOARD_EVENTS.conditionApplied]: specOf('conditionApplied', conditionAppliedDto),
  [BOARD_EVENTS.conditionRemoved]: specOf('conditionRemoved', conditionRemovedDto),
  [BOARD_EVENTS.combatStarted]: specOf('combatStarted', combatStartedDto),
  [BOARD_EVENTS.combatUpdated]: specOf('combatUpdated', combatUpdatedDto),
  [BOARD_EVENTS.combatTurnChanged]: specOf('combatTurnChanged', combatTurnChangedDto),
  [BOARD_EVENTS.combatEnded]: specOf('combatEnded', combatEndedDto),
};

export type ParsedBoardEvent =
  | Readonly<{ kind: 'event'; event: BoardEvent }>
  | Readonly<{ kind: 'other-table' }>
  | Readonly<{ kind: 'invalid' }>;

/** Validates one board event for the table `campaignId`: an event of another table is not ours,
 *  and one of ours outside the DTO means the board can no longer be trusted (resync).
 *
 *  Example: `parseBoardEvent('scene:updated', payload, campaignId).kind // 'event'` */
export function parseBoardEvent(
  name: string,
  payload: unknown,
  campaignId: string,
): ParsedBoardEvent {
  const spec = BOARD_EVENT_SPECS[name];
  if (!spec) {
    throw new Error(`no board event named ${name}; known: ${Object.keys(BOARD_EVENT_SPECS)}`);
  }
  if (campaignIdOf(payload) !== campaignId) return { kind: 'other-table' };
  const event = spec.build(payload);
  return event ? { kind: 'event', event } : { kind: 'invalid' };
}

function campaignIdOf(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null || !('campaignId' in payload)) return null;
  return payload.campaignId;
}
