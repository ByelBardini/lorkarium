import type {
  CombatEndedDto,
  CombatStartedDto,
  CombatTurnChangedDto,
  CombatUpdatedDto,
  ConditionAppliedDto,
  ConditionDefinedDto,
  ConditionRemovedDto,
  SceneUpdatedDto,
  TokenCreatedDto,
  TokenDeletedDto,
  TokenDraggedDto,
  TokenMovedDto,
  TokenUpdatedDto,
} from '@lorkarium/contracts';

/** A token event in its two versions: whole for the masters and the token's controllers,
 *  redacted for everyone else at the table (spec §3.9). */
export type TokenChange = Readonly<{
  name: 'token:created' | 'token:updated';
  campaignId: string;
  controllerIds: readonly string[];
  privileged: TokenCreatedDto | TokenUpdatedDto;
  others: TokenCreatedDto | TokenUpdatedDto;
}>;

/** Sends a confirmed board change to the table; called only after the transaction committed. */
export interface BoardPublisherPort {
  sceneUpdated(event: SceneUpdatedDto): void;
  tokenChanged(change: TokenChange): void;
  tokenMoved(event: TokenMovedDto): void;
  /** A drag preview: nothing was saved. `exceptConnectionId` is the dragger, who draws it locally. */
  tokenDragged(event: TokenDraggedDto, exceptConnectionId: string): void;
  tokenDeleted(event: TokenDeletedDto): void;
  conditionDefined(event: ConditionDefinedDto): void;
  conditionApplied(event: ConditionAppliedDto): void;
  conditionRemoved(event: ConditionRemovedDto): void;
  combatStarted(event: CombatStartedDto): void;
  combatUpdated(event: CombatUpdatedDto): void;
  combatTurnChanged(event: CombatTurnChangedDto): void;
  combatEnded(event: CombatEndedDto): void;
}
