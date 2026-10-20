import type { LightsDao } from '../../src/modules/lights/lights.dao';
import type {
  LightColorPo,
  LightMovePo,
  LightPo,
  LightRangePo,
  NewLightPo,
} from '../../src/modules/lights/lights.po';
import type { LightTransactionRunner } from '../../src/modules/lights/lights.service';
import type { ScenesDaoFake } from './scenes-fakes';
import { corridorTorchPo } from './lights-factories';

type LightsDaoMethods =
  | 'insertMany'
  | 'listOfScene'
  | 'findManyInScene'
  | 'moveMany'
  | 'setRanges'
  | 'setColors'
  | 'setLit'
  | 'deleteMany';

/** In-memory lights of every scene, filtered by scene like the real DAO. Writes go to `journal`
 *  ('save'), shared with the scenes fake, so a spec reads the whole order of a command.
 *
 *  Example: `const lights = new LightsDaoFake(scenes.journal, [corridorTorchPo()])` */
export class LightsDaoFake implements Pick<LightsDao, LightsDaoMethods> {
  constructor(
    private readonly journal: string[],
    readonly rows: LightPo[] = [],
  ) {}

  /** Bulk lights for the scene limit, without touching the journal. */
  fill(count: number, sceneId: string): void {
    for (let index = 0; index < count; index += 1) {
      this.rows.push(corridorTorchPo({ id: `filler-${index}`, sceneId, lightOrder: 1000 + index }));
    }
  }

  async insertMany(rows: readonly NewLightPo[]): Promise<LightPo[]> {
    this.journal.push('save');
    const saved = rows.map((row, index) =>
      corridorTorchPo({
        lit: true,
        ...row,
        id: `light-${this.rows.length + index + 1}`,
        lightOrder: 100 + index,
      }),
    );
    this.rows.push(...saved);
    return saved;
  }

  async listOfScene(sceneId: string): Promise<LightPo[]> {
    return this.rows.filter((row) => row.sceneId === sceneId);
  }

  async findManyInScene(sceneId: string, lightIds: readonly string[]): Promise<LightPo[]> {
    return this.rows.filter((row) => row.sceneId === sceneId && lightIds.includes(row.id));
  }

  // One 'save' for the whole group: it is one write in the transaction.
  async moveMany(sceneId: string, moves: readonly LightMovePo[]): Promise<void> {
    this.journal.push('save');
    for (const { lightId, x, y } of moves) this.patch(sceneId, lightId, { x, y });
  }

  async setRanges(sceneId: string, ranges: readonly LightRangePo[]): Promise<void> {
    this.journal.push('save');
    for (const { lightId, bright, dim } of ranges) this.patch(sceneId, lightId, { bright, dim });
  }

  async setColors(sceneId: string, colors: readonly LightColorPo[]): Promise<void> {
    this.journal.push('save');
    for (const { lightId, color } of colors) this.patch(sceneId, lightId, { color });
  }

  async setLit(sceneId: string, lightIds: readonly string[], lit: boolean): Promise<void> {
    this.journal.push('save');
    for (const lightId of lightIds) this.patch(sceneId, lightId, { lit });
  }

  async deleteMany(sceneId: string, lightIds: readonly string[]): Promise<void> {
    this.journal.push('save');
    const kept = this.rows.filter((row) => row.sceneId !== sceneId || !lightIds.includes(row.id));
    this.rows.splice(0, this.rows.length, ...kept);
  }

  private patch(sceneId: string, lightId: string, change: Partial<LightPo>): void {
    const index = this.rows.findIndex((row) => row.id === lightId && row.sceneId === sceneId);
    const found = this.rows[index];
    if (found) this.rows[index] = { ...found, ...change };
  }
}

/** Runs the work on the fakes and writes 'commit' to the shared journal once it resolves. */
export class LightTransactionRunnerFake {
  constructor(
    private readonly scenes: ScenesDaoFake,
    private readonly lights: LightsDaoFake,
  ) {}

  readonly run: LightTransactionRunner = async (work) => {
    const result = await work({ scenes: this.scenes, lights: this.lights });
    this.scenes.journal.push('commit');
    return result;
  };
}
