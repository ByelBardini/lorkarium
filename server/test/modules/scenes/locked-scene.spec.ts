import { describe, expect, it } from 'vitest';
import { inLockedScene, type SceneLockDaos } from '../../../src/modules/scenes/locked-scene';
import { QUELM_ID, VHARN_ID } from '../../support/campaigns-factories';
import { ScenesDaoFake } from '../../support/scenes-fakes';
import { VHARN_SCENE_ID, scenePo } from '../../support/scenes-factories';

function sceneWithVersion(version: number): ScenesDaoFake {
  const scenes = new ScenesDaoFake([scenePo({ version })]);
  scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
  return scenes;
}

function runnerOn(scenes: ScenesDaoFake) {
  return async <T>(work: (daos: SceneLockDaos) => Promise<T>): Promise<T> => {
    const result = await work({ scenes });
    scenes.journal.push('commit');
    return result;
  };
}

describe('inLockedScene', () => {
  it('locks the active scene, runs the work on it and bumps the version once, inside the transaction', async () => {
    const scenes = sceneWithVersion(4);

    const saved = await inLockedScene(runnerOn(scenes), VHARN_ID, async ({ scene }) => {
      scenes.journal.push('work');
      return scene.id;
    });

    expect(saved).toEqual({ value: VHARN_SCENE_ID, version: 5 });
    expect(scenes.journal).toEqual(['lock', 'work', 'bump', 'commit']);
  });

  it('a work that throws leaves the version as it was and never commits', async () => {
    const scenes = sceneWithVersion(4);

    const failing = inLockedScene(runnerOn(scenes), VHARN_ID, async () => {
      throw new Error('refused');
    });

    await expect(failing).rejects.toThrow('refused');
    expect(scenes.journal).toEqual(['lock']);
    expect(scenes.rows[0]?.version).toBe(4);
  });

  it('a campaign with no active scene throws citing the campaign', async () => {
    const scenes = sceneWithVersion(0);

    await expect(inLockedScene(runnerOn(scenes), QUELM_ID, async () => 1)).rejects.toThrow(
      new RegExp(`campaign ${QUELM_ID} has no active scene`),
    );
  });
});
