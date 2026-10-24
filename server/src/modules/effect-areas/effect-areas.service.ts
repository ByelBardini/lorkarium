import type {
  CreateEffectAreasCommandDto,
  DeleteEffectAreasCommandDto,
  ReshapeEffectAreasCommandDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { memberAccessOf } from '../campaigns/member-access';
import { AuthoredAccessBo } from '../scenes/authored-access.bo';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import {
  gridEventBase,
  inLockedGrid,
  type CreatedInScene,
  type LockedGrid,
  type GridLockDaos,
  type SceneTransaction,
} from '../scenes/locked-scene';
import type { ScenePo } from '../scenes/scenes.po';
import { EffectAreaRulesBo } from './effect-area-rules.bo';
import type { EffectAreasDao } from './effect-areas.dao';
import { EffectAreaNotFoundError } from './effect-areas.error';
import {
  areaOfShape,
  ownershipOf,
  savedShapeOf,
  shapeOfRow,
  toEffectAreaDto,
  toEffectAreaReshapePo,
  toNewEffectAreaPo,
} from './effect-areas.mapper';
import type { EffectAreaPo } from './effect-areas.po';

const EFFECT_AREA_NOUN = 'effect area';

type Envelope = 'actionId' | 'campaignId';
export type CreateEffectAreas = Omit<CreateEffectAreasCommandDto, Envelope>;
export type ReshapeEffectAreas = Omit<ReshapeEffectAreasCommandDto, Envelope>;
export type DeleteEffectAreas = Omit<DeleteEffectAreasCommandDto, Envelope>;

/** The DAOs a transaction hands out, bound to the open `tx`. */
export type EffectAreaWriteDaos = GridLockDaos &
  Readonly<{
    effectAreas: Pick<
      EffectAreasDao,
      'insertMany' | 'countOfScene' | 'findManyInScene' | 'reshapeMany' | 'deleteMany'
    >;
  }>;

export type EffectAreaTransactionRunner = SceneTransaction<EffectAreaWriteDaos>;

export type EffectAreasServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  transaction: EffectAreaTransactionRunner;
  publisher: BoardPublisherPort;
  clock: ClockPort;
  /** `EFFECT_AREAS_PER_SCENE_MAX`, handed to the rule. */
  limit: number;
}>;

type Locked = LockedGrid<EffectAreaWriteDaos>;

/** The area-of-effect use cases, each all or nothing in one version: lock the scene, decide,
 *  save, bump and, only after the commit, publish to the whole table (an area hides nothing).
 *  Any member creates; the author edits their own, the master any of them.
 *
 *  Example: `await service.createMany(userId, campaignId, { effectAreas: [circle] })` */
export class EffectAreasService {
  constructor(private readonly deps: EffectAreasServiceDeps) {}

  async createMany(
    userId: string,
    campaignId: string,
    command: CreateEffectAreas,
  ): Promise<CreatedInScene> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const shapes = command.effectAreas;
    const saved = await inLockedGrid(
      this.deps.transaction,
      { campaignId, sceneId: command.sceneId, access },
      async ({ daos, scene }) => {
        const rules = this.rulesFor(scene);
        rules.admit(await daos.effectAreas.countOfScene(scene.id), shapes.length);
        for (const shape of shapes) rules.place(areaOfShape(shape));
        const rows = shapes.map((shape) => toNewEffectAreaPo(scene.id, userId, shape));
        return (await daos.effectAreas.insertMany(rows)).map(toEffectAreaDto);
      },
    );
    const event = {
      ...gridEventBase(campaignId, saved, this.deps.clock),
      effectAreas: saved.value,
    };
    this.deps.publisher.effectAreasCreated(event);
    return { version: saved.version, createdIds: saved.value.map(({ id }) => id) };
  }

  async reshapeMany(
    userId: string,
    campaignId: string,
    command: ReshapeEffectAreas,
  ): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const author = new AuthoredAccessBo(access, EFFECT_AREA_NOUN);
    const ids = command.reshapes.map(({ effectAreaId }) => effectAreaId);
    const reshapes = command.reshapes.map(toEffectAreaReshapePo);
    const saved = await inLockedGrid(
      this.deps.transaction,
      { campaignId, sceneId: command.sceneId, access },
      async (locked) => {
        const rows = await effectAreasIn(locked, campaignId, ids);
        const rules = this.rulesFor(locked.scene);
        rows.forEach((row, index) => {
          const reshape = command.reshapes[index];
          if (!reshape) return;
          author.requireEdit('reshape', ownershipOf(row));
          rules.requireShape(row.id, reshape.expect, shapeOfRow(row));
          rules.place(areaOfShape(reshape.shape));
        });
        await locked.daos.effectAreas.reshapeMany(locked.scene.id, reshapes);
      },
    );
    const event = {
      ...gridEventBase(campaignId, saved, this.deps.clock),
      reshapes: reshapes.map(savedShapeOf),
    };
    this.deps.publisher.effectAreasReshaped(event);
    return saved.version;
  }

  async deleteMany(
    userId: string,
    campaignId: string,
    command: DeleteEffectAreas,
  ): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const author = new AuthoredAccessBo(access, EFFECT_AREA_NOUN);
    const { effectAreaIds } = command;
    const saved = await inLockedGrid(
      this.deps.transaction,
      { campaignId, sceneId: command.sceneId, access },
      async (locked) => {
        const rows = await effectAreasIn(locked, campaignId, effectAreaIds);
        const rules = this.rulesFor(locked.scene);
        for (const row of rows) {
          author.requireEdit('delete', ownershipOf(row));
          const expected = command.expect?.find(({ effectAreaId }) => effectAreaId === row.id);
          rules.requireShape(row.id, expected?.shape, shapeOfRow(row));
        }
        await locked.daos.effectAreas.deleteMany(locked.scene.id, effectAreaIds);
      },
    );
    const event = {
      ...gridEventBase(campaignId, saved, this.deps.clock),
      effectAreaIds: [...effectAreaIds],
    };
    this.deps.publisher.effectAreasDeleted(event);
    return saved.version;
  }

  private rulesFor(scene: ScenePo): EffectAreaRulesBo {
    const sceneSize = { widthCells: scene.widthCells, heightCells: scene.heightCells };
    return new EffectAreaRulesBo({ scene: sceneSize, limit: this.deps.limit });
  }
}

// Every id must be on the scene: the first one missing (another table's too) refuses them all.
async function effectAreasIn(
  { daos, scene }: Locked,
  campaignId: string,
  ids: readonly string[],
): Promise<EffectAreaPo[]> {
  const found = await daos.effectAreas.findManyInScene(scene.id, ids);
  const byId = new Map(found.map((row) => [row.id, row]));
  return ids.map((effectAreaId) => {
    const row = byId.get(effectAreaId);
    if (!row) throw new EffectAreaNotFoundError(campaignId, effectAreaId);
    return row;
  });
}
