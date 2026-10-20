import type {
  CreateLightsCommandDto,
  DeleteLightsCommandDto,
  MoveLightsCommandDto,
  SetLightColorsCommandDto,
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
  colorOfLight,
  lightMovedTo,
  positionOfLight,
  rangeOfLight,
  savedColorOf,
  savedMoveOf,
  savedRangeOf,
  sceneLightOf,
  sceneLightOfPlacement,
  toLightColorPo,
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
export type SetLightColors = Omit<SetLightColorsCommandDto, Envelope>;
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
      | 'setColors'
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
    const version = await this.changeEach(
      campaignId,
      moves,
      (rules, row, move) => {
        rules.requireAt(row.id, move.expect, positionOfLight(row));
        rules.place(lightMovedTo(sceneLightOf(row), move));
      },
      (lights, sceneId) => lights.moveMany(sceneId, moves.map(toLightMovePo)),
    );
    this.deps.publisher.lightsMoved({
      ...this.eventBase(campaignId, version),
      moves: moves.map(savedMoveOf),
    });
    return version;
  }

  async setRangeMany(userId: string, campaignId: string, command: SetLightRanges): Promise<number> {
    await this.requireMaster(userId, campaignId, 'change the range of lights');
    const { changes } = command;
    const version = await this.changeEach(
      campaignId,
      changes,
      (rules, row, change) => rules.requireRange(row.id, change.expect, rangeOfLight(row)),
      (lights, sceneId) => lights.setRanges(sceneId, changes.map(toLightRangePo)),
    );
    this.deps.publisher.lightRangesChanged({
      ...this.eventBase(campaignId, version),
      changes: changes.map(savedRangeOf),
    });
    return version;
  }

  async setColorMany(userId: string, campaignId: string, command: SetLightColors): Promise<number> {
    await this.requireMaster(userId, campaignId, 'change the color of lights');
    const { changes } = command;
    const version = await this.changeEach(
      campaignId,
      changes,
      (rules, row, change) => rules.requireColor(row.id, change.expect, colorOfLight(row)),
      (lights, sceneId) => lights.setColors(sceneId, changes.map(toLightColorPo)),
    );
    this.deps.publisher.lightColorsChanged({
      ...this.eventBase(campaignId, version),
      changes: changes.map(savedColorOf),
    });
    return version;
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

  /** Locks the scene, finds every light changed (all or none), checks each against its change
   *  and writes the group; answers the new version. */
  private async changeEach<Change extends Readonly<{ lightId: string }>>(
    campaignId: string,
    changes: readonly Change[],
    check: (rules: LightRulesBo, row: LightPo, change: Change) => void,
    write: (lights: LightWriteDaos['lights'], sceneId: string) => Promise<void>,
  ): Promise<number> {
    const saved = await inLockedScene(this.deps.transaction, campaignId, async (locked) => {
      const ids = changes.map(({ lightId }) => lightId);
      const rows = await lightsIn(locked, campaignId, ids);
      const rules = this.rulesFor(locked.scene);
      rows.forEach((row, index) => {
        const change = changes[index];
        if (change) check(rules, row, change);
      });
      await write(locked.daos.lights, locked.scene.id);
    });
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
