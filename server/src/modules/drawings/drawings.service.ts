import type {
  CreateDrawingsCommandDto,
  DeleteDrawingsCommandDto,
  MoveDrawingsCommandDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { memberAccessOf } from '../campaigns/member-access';
import { AuthoredAccessBo } from '../scenes/authored-access.bo';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import {
  inLockedScene,
  type CreatedInScene,
  type LockedScene,
  type SceneLockDaos,
  type SceneTransaction,
} from '../scenes/locked-scene';
import type { ScenePo } from '../scenes/scenes.po';
import { DrawingRulesBo } from './drawing-rules.bo';
import type { DrawingsDao } from './drawings.dao';
import { DrawingNotFoundError } from './drawings.error';
import {
  boxAt,
  boxOfShape,
  ownershipOf,
  positionOf,
  toDrawingDto,
  toDrawingMovePo,
  toHundredth,
  toNewDrawingPo,
} from './drawings.mapper';
import type { DrawingPo } from './drawings.po';

const DRAWING_NOUN = 'drawing';

type Envelope = 'actionId' | 'campaignId';
export type CreateDrawings = Omit<CreateDrawingsCommandDto, Envelope>;
export type MoveDrawings = Omit<MoveDrawingsCommandDto, Envelope>;
export type DeleteDrawings = Omit<DeleteDrawingsCommandDto, Envelope>;

/** The DAOs a transaction hands out, bound to the open `tx`. */
export type DrawingWriteDaos = SceneLockDaos &
  Readonly<{
    drawings: Pick<
      DrawingsDao,
      'insertMany' | 'countOfScene' | 'findManyInScene' | 'moveMany' | 'deleteMany'
    >;
  }>;

export type DrawingTransactionRunner = SceneTransaction<DrawingWriteDaos>;

export type DrawingsServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  transaction: DrawingTransactionRunner;
  publisher: BoardPublisherPort;
  clock: ClockPort;
  /** `DRAWINGS_PER_SCENE_MAX`, handed to the rule. */
  limit: number;
}>;

type Locked = LockedScene<DrawingWriteDaos>;
type EventBase = Readonly<{ campaignId: string; version: number; at: string }>;

/** The drawing use cases, each all or nothing in one version: lock the scene, decide, save, bump
 *  and, only after the commit, publish to the whole table (a drawing has nothing to redact).
 *
 *  Example: `const version = await drawingsService.createMany(user.id, campaignId, { drawings })` */
export class DrawingsService {
  constructor(private readonly deps: DrawingsServiceDeps) {}

  async createMany(
    userId: string,
    campaignId: string,
    command: CreateDrawings,
  ): Promise<CreatedInScene> {
    const access = new AuthoredAccessBo(
      await memberAccessOf(this.deps.members, campaignId, userId),
      DRAWING_NOUN,
    );
    for (const shape of command.drawings) access.requireLayer('draw', shape.layer);
    const saved = await inLockedScene(
      this.deps.transaction,
      campaignId,
      async ({ daos, scene }) => {
        const rules = this.rulesFor(scene);
        rules.admit(await daos.drawings.countOfScene(scene.id), command.drawings.length);
        for (const shape of command.drawings) rules.place(boxOfShape(shape));
        const rows = command.drawings.map((shape) => toNewDrawingPo(scene.id, userId, shape));
        return (await daos.drawings.insertMany(rows)).map(toDrawingDto);
      },
    );
    const event = { ...this.eventBase(campaignId, saved.version), drawings: saved.value };
    this.deps.publisher.drawingsCreated(event);
    return { version: saved.version, createdIds: saved.value.map(({ id }) => id) };
  }

  async moveMany(userId: string, campaignId: string, command: MoveDrawings): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const ids = command.moves.map(({ drawingId }) => drawingId);
    const saved = await inLockedScene(this.deps.transaction, campaignId, async (locked) => {
      const rows = await drawingsIn(locked, campaignId, ids);
      const rules = this.rulesFor(locked.scene);
      rows.forEach((row, index) => {
        const move = command.moves[index];
        if (!move) return;
        new AuthoredAccessBo(access, DRAWING_NOUN).requireEdit('move', ownershipOf(row));
        rules.requireAt(row.id, move.expect, positionOf(row));
        rules.place(boxAt(row, move));
      });
      await locked.daos.drawings.moveMany(locked.scene.id, command.moves.map(toDrawingMovePo));
    });
    const moves = command.moves.map(({ drawingId, x, y }) => ({
      drawingId,
      x: toHundredth(x),
      y: toHundredth(y),
    }));
    this.deps.publisher.drawingsMoved({ ...this.eventBase(campaignId, saved.version), moves });
    return saved.version;
  }

  async deleteMany(userId: string, campaignId: string, command: DeleteDrawings): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const { drawingIds } = command;
    const saved = await inLockedScene(this.deps.transaction, campaignId, async (locked) => {
      const rows = await drawingsIn(locked, campaignId, drawingIds);
      const rules = this.rulesFor(locked.scene);
      for (const row of rows) {
        new AuthoredAccessBo(access, DRAWING_NOUN).requireEdit('delete', ownershipOf(row));
        const expected = command.expect?.find(({ drawingId }) => drawingId === row.id);
        rules.requireAt(row.id, expected, positionOf(row));
      }
      await locked.daos.drawings.deleteMany(locked.scene.id, drawingIds);
    });
    const event = { ...this.eventBase(campaignId, saved.version), drawingIds: [...drawingIds] };
    this.deps.publisher.drawingsDeleted(event);
    return saved.version;
  }

  private rulesFor(scene: ScenePo): DrawingRulesBo {
    const sceneSize = { widthCells: scene.widthCells, heightCells: scene.heightCells };
    return new DrawingRulesBo({ scene: sceneSize, limit: this.deps.limit });
  }

  private eventBase(campaignId: string, version: number): EventBase {
    return { campaignId, version, at: this.deps.clock.now().toISOString() };
  }
}

// Every id must be on the scene: the first one missing (another table's too) refuses them all.
async function drawingsIn(
  { daos, scene }: Locked,
  campaignId: string,
  drawingIds: readonly string[],
): Promise<DrawingPo[]> {
  const found = await daos.drawings.findManyInScene(scene.id, drawingIds);
  const byId = new Map(found.map((row) => [row.id, row]));
  return drawingIds.map((drawingId) => {
    const row = byId.get(drawingId);
    if (!row) throw new DrawingNotFoundError(campaignId, drawingId);
    return row;
  });
}
