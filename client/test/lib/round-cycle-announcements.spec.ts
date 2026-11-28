import type { RoundCyclesAnnouncedDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { announcementOn } from '@/lib/round-cycle-announcements';
import { VHARN } from '../support/campaigns-api-fake';
import { MOON_ID } from '../support/round-cycle-fixtures';
import { VHARN_SCENE } from '../support/table-session-fixtures';

const TIDE_ID = '5b4a3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d';

const announced = (sceneId: string): RoundCyclesAnnouncedDto => ({
  campaignId: VHARN.id,
  sceneId,
  round: 4,
  at: '2026-11-25T21:00:00.000Z',
  announcements: [
    {
      cycleId: MOON_ID,
      cycleName: 'Fases da Lua',
      phase: { name: 'Lua Cheia', icon: 'game-icons:cycle' as const, imageAssetId: null },
    },
    {
      cycleId: TIDE_ID,
      cycleName: 'Maré',
      phase: { name: 'Alta', icon: 'game-icons:cycle' as const, imageAssetId: null },
    },
  ],
});

describe('announcementOn', () => {
  it('the phases that start the round on this grid, one item per cycle, in order', () => {
    expect(announcementOn(announced(VHARN_SCENE.id), VHARN_SCENE.id)).toEqual({
      key: '2026-11-25T21:00:00.000Z',
      round: 4,
      items: [
        {
          cycleId: MOON_ID,
          cycleName: 'Fases da Lua',
          phase: {
            phaseId: MOON_ID,
            name: 'Lua Cheia',
            icon: 'game-icons:cycle' as const,
            imageAssetId: null,
          },
        },
        {
          cycleId: TIDE_ID,
          cycleName: 'Maré',
          phase: {
            phaseId: TIDE_ID,
            name: 'Alta',
            icon: 'game-icons:cycle' as const,
            imageAssetId: null,
          },
        },
      ],
    });
  });

  it('an announcement of another grid is not shown here', () => {
    expect(announcementOn(announced('other-scene'), VHARN_SCENE.id)).toBeNull();
  });

  it('nothing announced is nothing to show', () => {
    expect(announcementOn(null, VHARN_SCENE.id)).toBeNull();
  });
});
