import type {
  CreateLightsCommandDto,
  DeleteLightsCommandDto,
  MoveLightsCommandDto,
  SetLightRangesCommandDto,
  SetLightsLitCommandDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { memberAccessOf } from '../campaigns/member-access';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import {
  inLockedScene,
  type CreatedInScene,
  type LockedScene,
  type SceneLockDaos,
  type SceneTransaction,
} from '../scenes/locked-scene';
import type { ScenePo } from '../scenes/scenes.po';
import { LightRulesBo } from './light-rules.bo';
import type { LightsDao } from './lights.dao';
import { LightNotFoundError } from './lights.error';
import {
  lightMovedTo,
  positionOfLight,
  rangeOfLight,
  savedMoveOf,
  savedRangeOf,
  sceneLightOf,
  sceneLightOfPlacement,
  toLightDto,
  toLightMovePo,
  toLightRangePo,
  toNewLightPo,
} from './lights.mapper';
import type { LightPo } from './lights.po';

type Envelope = 'actionId' | 'campaignId';
export type CreateLights = Omit<CreateLightsCommandDto, Envelope>;
export type MoveLights = Omit<MoveLightsCommandDto, Envelope>;
export type SetLightRanges = Omit<SetLightRangesCommandDto, Envelope>;
export type SetLightsLit = Omit<SetLightsLitCommandDto, Envelope>;
export type DeleteLights = Omit<DeleteLightsCommandDto, Envelope>;

/** The DAOs a transaction hands out, bound to the open `tx`. */
export type LightWriteDaos = SceneLockDaos &
  Readonly<{
    lights: Pick<
      LightsDao,
      | 'insertMany'
      | 'listOfScene'
      | 'findManyInScene'
      | 'moveMany'
      | 'setRanges'
      | 'setLit'
      | 'deleteMany'
    >;
  }>;

export type LightTransactionRunner = SceneTransaction<LightWriteDaos>;

export type LightsServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  transaction: LightTransactionRunner;
  publisher: BoardPublisherPort;
  clock: ClockPort;
  /** `LIGHTS_PER_SCENE_MAX`, passed in by the plugin. */
  limit: number;
}>;

type Locked = LockedScene<LightWriteDaos>;
type EventBase = Readonly<{ campaignId: string; version: number; at: string }>;

/** The map light use cases, master only, each all or nothing in one version: lock the scene,
 *  decide, save, bump and, only after the commit, publish to the whole table.
 *
 *  Example: `const created = await lightsService.createMany(user.id, campaignId, { lights })` */
export class LightsService {
  constructor(private readonly deps: LightsServiceDeps) {}

  async createMany(
    userId: string,
    campaignId: string,
    command: CreateLights,
  ): Promise<CreatedInScene> {
    await this.requireMaster(userId, campaignId, 'create lights');
    const saved = await inLockedScene(this.deps.transaction, campaignId, async (locked) => {
      const rules = this.rulesFor(locked.scene);
      for (const placement of command.lights) rules.place(sceneLightOfPlacement(placement));
      const stored = await locked.daos.lights.listOfScene(locked.scene.id);
      rules.admit(stored.length, command.lights.length);
      const rows = command.lights.map((placement) => toNewLightPo(locked.scene.id, placement));
      return (await locked.daos.lights.insertMany(rows)).map(toLightDto);
    });
    const event = { ...this.eventBase(campaignId, saved.version), lights: saved.value };
    this.deps.publisher.lightsCreated(event);
    return { version: saved.version, createdIds: saved.value.map(({ id }) => id) };
  }

  async moveMany(userId: string, campaignId: string, command: MoveLights): Promise<number> {
    await this.requireMaster(userId, campaignId, 'move lights');
    const { moves } = command;
    const saved = await inLockedScene(this.deps.transaction, campaignId, async (locked) => {
      const rows = await lightsIn(
        locked,
        campaignId,
        moves.map(({ lightId }) => lightId),
      );
      const rules = this.rulesFor(locked.scene);
      rows.forEach((row, index) => {
        const move = moves[index];
        if (!move) return;
        rules.requireAt(row.id, move.expect, positionOfLight(row));
        rules.place(lightMovedTo(sceneLightOf(row), move));
      });
      await locked.daos.lights.moveMany(locked.scene.id, moves.map(toLightMovePo));
    });
    const event = { ...this.eventBase(campaignId, saved.version), moves: moves.map(savedMoveOf) };
    this.deps.publisher.lightsMoved(event);
    return saved.version;
  }

  async setRangeMany(userId: string, campaignId: string, command: SetLightRanges): Promise<number> {
    await this.requireMaster(userId, campaignId, 'change the range of lights');
    const { changes } = command;
    const saved = await inLockedScene(this.deps.transaction, campaignId, async (locked) => {
      const rows = await lightsIn(
        locked,
        campaignId,
        changes.map(({ lightId }) => lightId),
      );
      const rules = this.rulesFor(locked.scene);
      rows.forEach((row, index) =>
        rules.requireRange(row.id, changes[index]?.expect, rangeOfLight(row)),
      );
      await locked.daos.lights.setRanges(locked.scene.id, changes.map(toLightRangePo));
    });
    const event = {
      ...this.eventBase(campaignId, saved.version),
      changes: changes.map(savedRangeOf),
    };
    this.deps.publisher.lightRangesChanged(event);
    return saved.version;
  }

  /** Lights or puts out map lights (master): a game action, like a door, so no undo precondition. */
  async setLitMany(userId: string, campaignId: string, command: SetLightsLit): Promise<number> {
    await this.requireMaster(userId, campaignId, 'light or put out lights');
    const { lightIds, lit } = command;
    const saved = await inLockedScene(this.deps.transaction, campaignId, async (locked) => {
      await lightsIn(locked, campaignId, lightIds);
      await locked.daos.lights.setLit(locked.scene.id, lightIds, lit);
    });
    const event = { ...this.eventBase(campaignId, saved.version), lightIds: [...lightIds], lit };
    this.deps.publisher.lightsLitChanged(event);
    return saved.version;
  }

  async deleteMany(userId: string, campaignId: string, command: DeleteLights): Promise<number> {
    await this.requireMaster(userId, campaignId, 'delete lights');
    const { lightIds } = command;
    const saved = await inLockedScene(this.deps.transaction, campaignId, async (locked) => {
      const rules = this.rulesFor(locked.scene);
      for (const row of await lightsIn(locked, campaignId, lightIds)) {
        const expected = command.expect?.find(({ lightId }) => lightId === row.id);
        rules.requireAt(row.id, expected, positionOfLight(row));
      }
      await locked.daos.lights.deleteMany(locked.scene.id, lightIds);
    });
    const event = { ...this.eventBase(campaignId, saved.version), lightIds: [...lightIds] };
    this.deps.publisher.lightsDeleted(event);
    return saved.version;
  }

  private async requireMaster(userId: string, campaignId: string, action: string): Promise<void> {
    (await memberAccessOf(this.deps.members, campaignId, userId)).requireMaster(action);
  }

  private rulesFor(scene: ScenePo): LightRulesBo {
    const sceneSize = { widthCells: scene.widthCells, heightCells: scene.heightCells };
    return new LightRulesBo({ scene: sceneSize, limit: this.deps.limit });
  }

  private eventBase(campaignId: string, version: number): EventBase {
    return { campaignId, version, at: this.deps.clock.now().toISOString() };
  }
}

// Every id must be on the scene: the first one missing (another table's too) refuses them all.
async function lightsIn(
  { daos, scene }: Locked,
  campaignId: string,
  lightIds: readonly string[],
): Promise<LightPo[]> {
  const found = await daos.lights.findManyInScene(scene.id, lightIds);
  const byId = new Map(found.map((row) => [row.id, row]));
  return lightIds.map((lightId) => {
    const row = byId.get(lightId);
    if (!row) throw new LightNotFoundError(campaignId, lightId);
    return row;
  });
}
