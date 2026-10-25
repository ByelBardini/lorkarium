import {
  BOARD_EVENTS,
  boardAdvancedDto,
  tokensHiddenChangedDto,
  veiledLightsChangedDto,
  type BoardAdvancedDto,
  type TokensHiddenChangedDto,
  type VeiledLightsChangedDto,
  combatEndedDto,
  combatStartedDto,
  combatTurnChangedDto,
  combatUpdatedDto,
  conditionAppliedDto,
  conditionDefaultsRestoredDto,
  conditionDefinedDto,
  conditionDefinitionDeletedDto,
  conditionDefinitionUpdatedDto,
  conditionRemovedDto,
  conditionsAppliedDto,
  conditionsChangedDto,
  doorChangedDto,
  drawingsCreatedDto,
  drawingsDeletedDto,
  drawingsMovedDto,
  effectAreasCreatedDto,
  effectAreasDeletedDto,
  effectAreasReshapedDto,
  lightColorsChangedDto,
  lightConesChangedDto,
  lightRangesChangedDto,
  lightsCreatedDto,
  lightsDeletedDto,
  lightsLitChangedDto,
  lightsMovedDto,
  sceneUpdatedDto,
  tokenCreatedDto,
  tokenDeletedDto,
  tokenLayerChangedDto,
  tokenMovedDto,
  tokenUpdatedDto,
  tokensCreatedDto,
  tokensDeletedDto,
  tokensMovedDto,
  tokensFacedDto,
  tokensResizedDto,
  mainTokenChangedDto,
  memberCardChangedDto,
  tokensRestyledDto,
  wallKindsChangedDto,
  wallsCreatedDto,
  wallsDeletedDto,
  wallsMovedDto,
  wallSegmentErasedDto,
  wallAreaErasedDto,
  type DoorChangedDto,
  type LightColorsChangedDto,
  type LightConesChangedDto,
  type LightRangesChangedDto,
  type LightsCreatedDto,
  type LightsDeletedDto,
  type LightsLitChangedDto,
  type LightsMovedDto,
  type WallKindsChangedDto,
  type WallsCreatedDto,
  type WallsDeletedDto,
  type WallsMovedDto,
  type WallSegmentErasedDto,
  type WallAreaErasedDto,
  type EffectAreasCreatedDto,
  type EffectAreasDeletedDto,
  type EffectAreasReshapedDto,
  type TokensFacedDto,
  type TokensResizedDto,
  type TokensRestyledDto,
  type CombatEndedDto,
  type CombatStartedDto,
  type CombatTurnChangedDto,
  type CombatUpdatedDto,
  type ConditionAppliedDto,
  type ConditionDefaultsRestoredDto,
  type ConditionDefinedDto,
  type ConditionDefinitionDeletedDto,
  type ConditionDefinitionUpdatedDto,
  type ConditionsChangedDto,
  type ConditionRemovedDto,
  type ConditionsAppliedDto,
  type DrawingsCreatedDto,
  type DrawingsDeletedDto,
  type DrawingsMovedDto,
  type SceneUpdatedDto,
  type TokenCreatedDto,
  type TokenDeletedDto,
  type TokenLayerChangedDto,
  type TokenMovedDto,
  type TokenUpdatedDto,
  type TokensCreatedDto,
  type TokensDeletedDto,
  type TokensMovedDto,
  type MainTokenChangedDto,
  type MemberCardChangedDto,
} from '@lorkarium/contracts';
import type { z } from 'zod';

/** A board event of the open table, already validated by its DTO. */
export type BoardEvent =
  | Readonly<{ type: 'sceneUpdated'; payload: SceneUpdatedDto }>
  | Readonly<{ type: 'tokenCreated'; payload: TokenCreatedDto }>
  | Readonly<{ type: 'tokenUpdated'; payload: TokenUpdatedDto }>
  | Readonly<{ type: 'tokenMoved'; payload: TokenMovedDto }>
  | Readonly<{ type: 'tokenDeleted'; payload: TokenDeletedDto }>
  | Readonly<{ type: 'tokensMoved'; payload: TokensMovedDto }>
  | Readonly<{ type: 'tokenLayerChanged'; payload: TokenLayerChangedDto }>
  | Readonly<{ type: 'tokensFaced'; payload: TokensFacedDto }>
  | Readonly<{ type: 'tokensResized'; payload: TokensResizedDto }>
  | Readonly<{ type: 'tokensRestyled'; payload: TokensRestyledDto }>
  | Readonly<{ type: 'tokensCreated'; payload: TokensCreatedDto }>
  | Readonly<{ type: 'tokensDeleted'; payload: TokensDeletedDto }>
  /** The grid moved a version and nothing of it is for this viewer (it touched hidden tokens). */
  | Readonly<{ type: 'boardAdvanced'; payload: BoardAdvancedDto }>
  | Readonly<{ type: 'tokensHiddenChanged'; payload: TokensHiddenChangedDto }>
  | Readonly<{ type: 'mainTokenChanged'; payload: MainTokenChangedDto }>
  | Readonly<{ type: 'memberCardChanged'; payload: MemberCardChangedDto }>
  | Readonly<{ type: 'drawingsCreated'; payload: DrawingsCreatedDto }>
  | Readonly<{ type: 'drawingsMoved'; payload: DrawingsMovedDto }>
  | Readonly<{ type: 'drawingsDeleted'; payload: DrawingsDeletedDto }>
  | Readonly<{ type: 'effectAreasCreated'; payload: EffectAreasCreatedDto }>
  | Readonly<{ type: 'effectAreasReshaped'; payload: EffectAreasReshapedDto }>
  | Readonly<{ type: 'effectAreasDeleted'; payload: EffectAreasDeletedDto }>
  | Readonly<{ type: 'wallsCreated'; payload: WallsCreatedDto }>
  | Readonly<{ type: 'wallsMoved'; payload: WallsMovedDto }>
  | Readonly<{ type: 'wallsDeleted'; payload: WallsDeletedDto }>
  | Readonly<{ type: 'wallSegmentErased'; payload: WallSegmentErasedDto }>
  | Readonly<{ type: 'wallAreaErased'; payload: WallAreaErasedDto }>
  | Readonly<{ type: 'wallKindsChanged'; payload: WallKindsChangedDto }>
  | Readonly<{ type: 'doorChanged'; payload: DoorChangedDto }>
  | Readonly<{ type: 'lightsCreated'; payload: LightsCreatedDto }>
  | Readonly<{ type: 'lightsMoved'; payload: LightsMovedDto }>
  | Readonly<{ type: 'lightRangesChanged'; payload: LightRangesChangedDto }>
  | Readonly<{ type: 'lightColorsChanged'; payload: LightColorsChangedDto }>
  | Readonly<{ type: 'lightConesChanged'; payload: LightConesChangedDto }>
  | Readonly<{ type: 'lightsLitChanged'; payload: LightsLitChangedDto }>
  | Readonly<{ type: 'lightsDeleted'; payload: LightsDeletedDto }>
  | Readonly<{ type: 'conditionDefined'; payload: ConditionDefinedDto }>
  /** The table's list (the cast): a definition edited, deleted, or the missing defaults back. */
  | Readonly<{ type: 'conditionDefinitionUpdated'; payload: ConditionDefinitionUpdatedDto }>
  | Readonly<{ type: 'conditionDefinitionDeleted'; payload: ConditionDefinitionDeletedDto }>
  | Readonly<{ type: 'conditionDefaultsRestored'; payload: ConditionDefaultsRestoredDto }>
  | Readonly<{ type: 'conditionApplied'; payload: ConditionAppliedDto }>
  | Readonly<{ type: 'conditionsApplied'; payload: ConditionsAppliedDto }>
  /** The anchors' conditions after the end of a turn of a token linked to them (the cast). */
  | Readonly<{ type: 'conditionsChanged'; payload: ConditionsChangedDto }>
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
  [BOARD_EVENTS.tokensMoved]: specOf('tokensMoved', tokensMovedDto),
  [BOARD_EVENTS.tokenLayerChanged]: specOf('tokenLayerChanged', tokenLayerChangedDto),
  [BOARD_EVENTS.tokensFaced]: specOf('tokensFaced', tokensFacedDto),
  [BOARD_EVENTS.tokensResized]: specOf('tokensResized', tokensResizedDto),
  [BOARD_EVENTS.tokensRestyled]: specOf('tokensRestyled', tokensRestyledDto),
  [BOARD_EVENTS.tokensCreated]: specOf('tokensCreated', tokensCreatedDto),
  [BOARD_EVENTS.tokensDeleted]: specOf('tokensDeleted', tokensDeletedDto),
  [BOARD_EVENTS.boardAdvanced]: specOf('boardAdvanced', boardAdvancedDto),
  [BOARD_EVENTS.tokensHiddenChanged]: specOf('tokensHiddenChanged', tokensHiddenChangedDto),
  [BOARD_EVENTS.mainTokenChanged]: specOf('mainTokenChanged', mainTokenChangedDto),
  [BOARD_EVENTS.memberCardChanged]: specOf('memberCardChanged', memberCardChangedDto),
  [BOARD_EVENTS.drawingsCreated]: specOf('drawingsCreated', drawingsCreatedDto),
  [BOARD_EVENTS.drawingsMoved]: specOf('drawingsMoved', drawingsMovedDto),
  [BOARD_EVENTS.drawingsDeleted]: specOf('drawingsDeleted', drawingsDeletedDto),
  [BOARD_EVENTS.effectAreasCreated]: specOf('effectAreasCreated', effectAreasCreatedDto),
  [BOARD_EVENTS.effectAreasReshaped]: specOf('effectAreasReshaped', effectAreasReshapedDto),
  [BOARD_EVENTS.effectAreasDeleted]: specOf('effectAreasDeleted', effectAreasDeletedDto),
  [BOARD_EVENTS.wallsCreated]: specOf('wallsCreated', wallsCreatedDto),
  [BOARD_EVENTS.wallsMoved]: specOf('wallsMoved', wallsMovedDto),
  [BOARD_EVENTS.wallsDeleted]: specOf('wallsDeleted', wallsDeletedDto),
  [BOARD_EVENTS.wallSegmentErased]: specOf('wallSegmentErased', wallSegmentErasedDto),
  [BOARD_EVENTS.wallAreaErased]: specOf('wallAreaErased', wallAreaErasedDto),
  [BOARD_EVENTS.wallKindsChanged]: specOf('wallKindsChanged', wallKindsChangedDto),
  [BOARD_EVENTS.doorChanged]: specOf('doorChanged', doorChangedDto),
  [BOARD_EVENTS.lightsCreated]: specOf('lightsCreated', lightsCreatedDto),
  [BOARD_EVENTS.lightsMoved]: specOf('lightsMoved', lightsMovedDto),
  [BOARD_EVENTS.lightRangesChanged]: specOf('lightRangesChanged', lightRangesChangedDto),
  [BOARD_EVENTS.lightColorsChanged]: specOf('lightColorsChanged', lightColorsChangedDto),
  [BOARD_EVENTS.lightConesChanged]: specOf('lightConesChanged', lightConesChangedDto),
  [BOARD_EVENTS.lightsLitChanged]: specOf('lightsLitChanged', lightsLitChangedDto),
  [BOARD_EVENTS.lightsDeleted]: specOf('lightsDeleted', lightsDeletedDto),
  [BOARD_EVENTS.conditionDefined]: specOf('conditionDefined', conditionDefinedDto),
  [BOARD_EVENTS.conditionDefinitionUpdated]: specOf(
    'conditionDefinitionUpdated',
    conditionDefinitionUpdatedDto,
  ),
  [BOARD_EVENTS.conditionDefinitionDeleted]: specOf(
    'conditionDefinitionDeleted',
    conditionDefinitionDeletedDto,
  ),
  [BOARD_EVENTS.conditionDefaultsRestored]: specOf(
    'conditionDefaultsRestored',
    conditionDefaultsRestoredDto,
  ),
  [BOARD_EVENTS.conditionApplied]: specOf('conditionApplied', conditionAppliedDto),
  [BOARD_EVENTS.conditionsApplied]: specOf('conditionsApplied', conditionsAppliedDto),
  [BOARD_EVENTS.conditionRemoved]: specOf('conditionRemoved', conditionRemovedDto),
  [BOARD_EVENTS.conditionsChanged]: specOf('conditionsChanged', conditionsChangedDto),
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

/** The lights of the hidden tokens this viewer does not receive, for the table `campaignId`, or
 *  `null`: another table's, or outside the DTO. Unversioned like a drag preview, so a malformed one
 *  is dropped with no resync (the next list or snapshot replaces it whole).
 *
 *  Example: `parseVeiledLights(payload, campaignId)?.lights.length` */
export function parseVeiledLights(
  payload: unknown,
  campaignId: string,
): VeiledLightsChangedDto | null {
  const parsed = veiledLightsChangedDto.safeParse(payload);
  return parsed.success && parsed.data.campaignId === campaignId ? parsed.data : null;
}

function campaignIdOf(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null || !('campaignId' in payload)) return null;
  return payload.campaignId;
}
