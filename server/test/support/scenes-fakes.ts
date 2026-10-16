import type {
  CombatEndedDto,
  CombatStartedDto,
  CombatTurnChangedDto,
  CombatUpdatedDto,
  ConditionAppliedDto,
  ConditionDefinedDto,
  ConditionRemovedDto,
  SceneUpdatedDto,
  TokenDeletedDto,
  TokenDraggedDto,
  TokenMovedDto,
} from '@lorkarium/contracts';
import type {
  BoardPublisherPort,
  TokenChange,
} from '../../src/modules/scenes/board-publisher.port';
import type { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import type { SceneTransactionRunner } from '../../src/modules/scenes/scenes.service';
import type { NewScenePo, SceneGridPo, ScenePo } from '../../src/modules/scenes/scenes.po';
import { scenePo } from './scenes-factories';

/** In-memory scenes table. `activeOf` maps a campaign to its active scene (the
 *  `campaigns.active_scene_id` of the real query); `journal` records lock, update and bump in order. */
export class ScenesDaoFake implements Pick<
  ScenesDao,
  'insert' | 'findActiveOf' | 'lockActiveOf' | 'bumpVersion' | 'update'
> {
  readonly journal: string[] = [];
  readonly activeOf = new Map<string, string>();

  constructor(readonly rows: ScenePo[] = []) {}

  async insert(scene: NewScenePo): Promise<ScenePo> {
    const row = scenePo({ id: `scene-${this.rows.length + 1}`, version: 0, ...scene });
    this.rows.push(row);
    return row;
  }

  async findActiveOf(campaignId: string): Promise<ScenePo | undefined> {
    const sceneId = this.activeOf.get(campaignId);
    return this.rows.find((row) => row.id === sceneId && row.campaignId === campaignId);
  }

  async lockActiveOf(campaignId: string): Promise<ScenePo | undefined> {
    this.journal.push('lock');
    return this.findActiveOf(campaignId);
  }

  async bumpVersion(sceneId: string): Promise<number> {
    this.journal.push('bump');
    const row = this.rowOf(sceneId);
    row.version += 1;
    return row.version;
  }

  async update(sceneId: string, grid: SceneGridPo): Promise<ScenePo> {
    this.journal.push('save');
    const row = this.rowOf(sceneId);
    Object.assign(row, grid);
    return { ...row };
  }

  private rowOf(sceneId: string): ScenePo {
    const row = this.rows.find((candidate) => candidate.id === sceneId);
    if (!row) throw new Error(`ScenesDaoFake has no scene ${sceneId}`);
    return row;
  }
}

/** Records every published board event; writes 'publish' to the shared journal to prove the order. */
export class BoardPublisherFake implements BoardPublisherPort {
  readonly sceneUpdates: SceneUpdatedDto[] = [];

  constructor(private readonly journal: string[] = []) {}

  readonly tokenChanges: TokenChange[] = [];
  readonly tokenMoves: TokenMovedDto[] = [];
  readonly tokenDeletes: TokenDeletedDto[] = [];
  readonly tokenDrags: Array<Readonly<{ event: TokenDraggedDto; exceptConnectionId: string }>> = [];
  readonly combatEvents: Array<
    | Readonly<{ name: 'combat:started'; event: CombatStartedDto }>
    | Readonly<{ name: 'combat:updated'; event: CombatUpdatedDto }>
    | Readonly<{ name: 'combat:turnChanged'; event: CombatTurnChangedDto }>
    | Readonly<{ name: 'combat:ended'; event: CombatEndedDto }>
  > = [];
  readonly conditionEvents: Array<ConditionDefinedDto | ConditionAppliedDto | ConditionRemovedDto> =
    [];

  sceneUpdated(event: SceneUpdatedDto): void {
    this.journal.push('publish');
    this.sceneUpdates.push(event);
  }

  tokenChanged(change: TokenChange): void {
    this.journal.push('publish');
    this.tokenChanges.push(change);
  }

  tokenMoved(event: TokenMovedDto): void {
    this.journal.push('publish');
    this.tokenMoves.push(event);
  }

  tokenDragged(event: TokenDraggedDto, exceptConnectionId: string): void {
    this.journal.push('publish');
    this.tokenDrags.push({ event, exceptConnectionId });
  }

  tokenDeleted(event: TokenDeletedDto): void {
    this.journal.push('publish');
    this.tokenDeletes.push(event);
  }

  conditionDefined(event: ConditionDefinedDto): void {
    this.journal.push('publish');
    this.conditionEvents.push(event);
  }

  conditionApplied(event: ConditionAppliedDto): void {
    this.journal.push('publish');
    this.conditionEvents.push(event);
  }

  conditionRemoved(event: ConditionRemovedDto): void {
    this.journal.push('publish');
    this.conditionEvents.push(event);
  }

  combatStarted(event: CombatStartedDto): void {
    this.journal.push('publish');
    this.combatEvents.push({ name: 'combat:started', event });
  }

  combatUpdated(event: CombatUpdatedDto): void {
    this.journal.push('publish');
    this.combatEvents.push({ name: 'combat:updated', event });
  }

  combatTurnChanged(event: CombatTurnChangedDto): void {
    this.journal.push('publish');
    this.combatEvents.push({ name: 'combat:turnChanged', event });
  }

  combatEnded(event: CombatEndedDto): void {
    this.journal.push('publish');
    this.combatEvents.push({ name: 'combat:ended', event });
  }

  /** How many events went out, of any kind. */
  get published(): number {
    return (
      this.sceneUpdates.length +
      this.tokenChanges.length +
      this.tokenMoves.length +
      this.tokenDeletes.length +
      this.tokenDrags.length +
      this.conditionEvents.length +
      this.combatEvents.length
    );
  }
}

/** Runs the work on the fake DAO and writes 'commit' to its journal once the work resolves. */
export class SceneTransactionRunnerFake {
  constructor(private readonly scenes: ScenesDaoFake) {}

  readonly run: SceneTransactionRunner = async (work) => {
    const result = await work({ scenes: this.scenes });
    this.scenes.journal.push('commit');
    return result;
  };
}
