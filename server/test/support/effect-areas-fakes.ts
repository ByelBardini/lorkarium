import type { EffectAreasDao } from '../../src/modules/effect-areas/effect-areas.dao';
import type {
  EffectAreaPo,
  EffectAreaReshapePo,
  NewEffectAreaPo,
} from '../../src/modules/effect-areas/effect-areas.po';
import type { EffectAreaTransactionRunner } from '../../src/modules/effect-areas/effect-areas.service';
import { biaConePo } from './effect-areas-factories';
import type { ScenesDaoFake } from './scenes-fakes';

/** In-memory areas of every scene, filtered by scene like the real DAO. Writes go to `journal`
 *  ('save'), shared with the scenes fake, so a spec reads the whole order of a command.
 *
 *  Example: `const areas = new EffectAreasDaoFake(scenes.journal, [biaConePo()])` */
export class EffectAreasDaoFake implements Pick<
  EffectAreasDao,
  'insertMany' | 'listOfScene' | 'countOfScene' | 'findManyInScene' | 'reshapeMany' | 'deleteMany'
> {
  constructor(
    private readonly journal: string[],
    readonly rows: EffectAreaPo[] = [],
  ) {}

  /** Bulk rows for the scene limit, without touching the journal. */
  fill(count: number, sceneId: string): void {
    for (let index = 0; index < count; index += 1) {
      this.rows.push(biaConePo({ id: `filler-${index}`, sceneId, areaOrder: 1000 + index }));
    }
  }

  async insertMany(rows: readonly NewEffectAreaPo[]): Promise<EffectAreaPo[]> {
    this.journal.push('save');
    const saved = rows.map((row, index) =>
      biaConePo({
        ...row,
        id: `effect-area-${this.rows.length + index + 1}`,
        areaOrder: 100 + index,
        facing: row.facing ?? 0,
      }),
    );
    this.rows.push(...saved);
    return saved;
  }

  async listOfScene(sceneId: string): Promise<EffectAreaPo[]> {
    return this.rows.filter((row) => row.sceneId === sceneId);
  }

  async countOfScene(sceneId: string): Promise<number> {
    return (await this.listOfScene(sceneId)).length;
  }

  async findManyInScene(sceneId: string, ids: readonly string[]): Promise<EffectAreaPo[]> {
    return this.rows.filter((row) => row.sceneId === sceneId && ids.includes(row.id));
  }

  // One 'save' for the whole group: it is one write in the transaction.
  async reshapeMany(sceneId: string, reshapes: readonly EffectAreaReshapePo[]): Promise<void> {
    this.journal.push('save');
    for (const { effectAreaId, shape } of reshapes) {
      const index = this.rows.findIndex(
        (row) => row.id === effectAreaId && row.sceneId === sceneId,
      );
      const found = this.rows[index];
      if (found) this.rows[index] = { ...found, ...shape, facing: shape.facing ?? 0 };
    }
  }

  async deleteMany(sceneId: string, ids: readonly string[]): Promise<void> {
    this.journal.push('save');
    const kept = this.rows.filter((row) => row.sceneId !== sceneId || !ids.includes(row.id));
    this.rows.splice(0, this.rows.length, ...kept);
  }
}

/** Runs the work on the fakes and writes 'commit' to the shared journal once it resolves. */
export class EffectAreaTransactionRunnerFake {
  constructor(
    private readonly scenes: ScenesDaoFake,
    private readonly effectAreas: EffectAreasDaoFake,
  ) {}

  readonly run: EffectAreaTransactionRunner = async (work) => {
    const result = await work({ scenes: this.scenes, effectAreas: this.effectAreas });
    this.scenes.journal.push('commit');
    return result;
  };
}
