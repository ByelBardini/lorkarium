import { describe, expect, it } from 'vitest';
import { CampaignAccessBo } from '../../../src/modules/campaigns/campaign-access.bo';
import {
  gridEventBase,
  inLockedGrid,
  type GridLockDaos,
} from '../../../src/modules/scenes/locked-scene';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { TORRE_ID } from '../../support/library-factories';
import { BIA_ID, QUELM_ID, VHARN_ID } from '../../support/campaigns-factories';
import { ScenesDaoFake } from '../../support/scenes-fakes';
import { VHARN_SCENE_ID, scenePo } from '../../support/scenes-factories';

function sceneWithVersion(version: number): ScenesDaoFake {
  const scenes = new ScenesDaoFake([scenePo({ version })]);
  scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
  return scenes;
}

function runnerOn(scenes: ScenesDaoFake) {
  return async <T>(work: (daos: GridLockDaos) => Promise<T>): Promise<T> => {
    const result = await work({ scenes });
    scenes.journal.push('commit');
    return result;
  };
}

describe('inLockedGrid on the group grid', () => {
  const ana = new CampaignAccessBo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' });

  it('locks the active scene, runs the work on it and bumps the version once, inside the transaction', async () => {
    const scenes = sceneWithVersion(4);

    const saved = await inLockedGrid(
      runnerOn(scenes),
      { campaignId: VHARN_ID, access: ana },
      async ({ scene }) => {
        scenes.journal.push('work');
        return scene.id;
      },
    );

    expect(saved).toEqual({ value: VHARN_SCENE_ID, version: 5, sceneId: VHARN_SCENE_ID });
    expect(scenes.journal).toEqual(['lock', 'work', 'bump', 'commit']);
  });

  it('a work that throws leaves the version as it was and never commits', async () => {
    const scenes = sceneWithVersion(4);

    const failing = inLockedGrid(
      runnerOn(scenes),
      { campaignId: VHARN_ID, access: ana },
      async () => {
        throw new Error('refused');
      },
    );

    await expect(failing).rejects.toThrow('refused');
    expect(scenes.journal).toEqual(['lock']);
    expect(scenes.rows[0]?.version).toBe(4);
  });

  it('a campaign with no active scene throws citing the campaign', async () => {
    const scenes = sceneWithVersion(0);

    await expect(
      inLockedGrid(runnerOn(scenes), { campaignId: QUELM_ID, access: ana }, async () => 1),
    ).rejects.toThrow(new RegExp(`campaign ${QUELM_ID} has no active scene`));
  });
});

describe('inLockedGrid', () => {
  const ana = new CampaignAccessBo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' });
  const bia = new CampaignAccessBo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' });

  function withTorre(visibility: 'private' | 'public'): ScenesDaoFake {
    const scenes = sceneWithVersion(4);
    scenes.rows.push(scenePo({ id: TORRE_ID, visibility, version: 0 }));
    return scenes;
  }

  it('the master reaches the private Torre: it is locked, worked on and bumped, and named in the result', async () => {
    const scenes = withTorre('private');
    const address = { campaignId: VHARN_ID, sceneId: TORRE_ID, access: ana };

    const saved = await inLockedGrid(runnerOn(scenes), address, async ({ scene }) => scene.name);

    expect(saved).toEqual({ value: 'Cena 1', version: 1, sceneId: TORRE_ID });
    expect(scenes.journal).toEqual([`lockInCampaign:${TORRE_ID}`, 'bump', 'commit']);
  });

  it('no sceneId locks the group grid', async () => {
    const scenes = withTorre('public');

    const saved = await inLockedGrid(
      runnerOn(scenes),
      { campaignId: VHARN_ID, access: bia },
      async () => 0,
    );

    expect(saved).toMatchObject({ version: 5, sceneId: VHARN_SCENE_ID });
  });

  it('Bia reaches the group grid even while it is private', async () => {
    const scenes = sceneWithVersion(4);
    const address = { campaignId: VHARN_ID, sceneId: VHARN_SCENE_ID, access: bia };

    const saved = await inLockedGrid(runnerOn(scenes), address, async () => 0);

    expect(saved.version).toBe(5);
  });

  it('Bia reaches the Torre once it is public', async () => {
    const scenes = withTorre('public');
    const address = { campaignId: VHARN_ID, sceneId: TORRE_ID, access: bia };

    expect((await inLockedGrid(runnerOn(scenes), address, async () => 0)).version).toBe(1);
  });

  it('Bia in the private Torre gets SCENE_NOT_FOUND before the work, and nothing is bumped', async () => {
    const scenes = withTorre('private');
    const address = { campaignId: VHARN_ID, sceneId: TORRE_ID, access: bia };
    const worked: string[] = [];

    const reach = inLockedGrid(runnerOn(scenes), address, async () => worked.push('work'));

    await expect(reach).rejects.toMatchObject({ code: 'SCENE_NOT_FOUND' });
    expect(worked).toEqual([]);
    expect(scenes.journal).toEqual([`lockInCampaign:${TORRE_ID}`]);
  });

  it('a grid id the table does not have is SCENE_NOT_FOUND citing it, even for the master', async () => {
    const scenes = sceneWithVersion(4);
    const address = { campaignId: VHARN_ID, sceneId: TORRE_ID, access: ana };

    await expect(inLockedGrid(runnerOn(scenes), address, async () => 0)).rejects.toThrow(
      expect.objectContaining({
        code: 'SCENE_NOT_FOUND',
        message: expect.stringContaining(TORRE_ID),
      }),
    );
  });
});

describe('gridEventBase', () => {
  it('opens an event with the table, the grid and the version saved, at the clock time', () => {
    const clock = new ClockFake(new Date('2026-10-22T21:00:00Z'));
    const saved = { value: null, version: 8, sceneId: TORRE_ID };

    expect(gridEventBase(VHARN_ID, saved, clock)).toEqual({
      campaignId: VHARN_ID,
      sceneId: TORRE_ID,
      version: 8,
      at: '2026-10-22T21:00:00.000Z',
    });
  });
});
