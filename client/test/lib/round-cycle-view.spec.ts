import { describe, expect, it } from 'vitest';
import { cycleBadgesOf } from '@/lib/round-cycle-view';
import { MOON_PHASE_IDS, moonCycle } from '../support/round-cycle-fixtures';
import { VHARN_SCENE } from '../support/table-session-fixtures';

const OTHER_SCENE = '0c9b8a7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d';

describe('cycleBadgesOf', () => {
  it('a cycle in the combat of this grid shows its phase, the round and the following phase', () => {
    const [badge] = cycleBadgesOf([moonCycle({ current: 1, round: 2 })], VHARN_SCENE.id);
    expect(badge).toMatchObject({
      name: 'Fases da Lua',
      round: 2,
      current: { name: 'Crescente' },
      next: { name: 'Lua Cheia' },
      chosen: false,
      canChoose: false,
    });
  });

  it('a chosen phase is the next one and marks the badge as chosen', () => {
    const [badge] = cycleBadgesOf([moonCycle({ current: 2, chosen: 0 })], VHARN_SCENE.id);
    expect([badge?.next?.name, badge?.chosen]).toEqual(['Lua Nova', true]);
  });

  it('after the last phase the next one is the first', () => {
    const [badge] = cycleBadgesOf([moonCycle({ current: 3 })], VHARN_SCENE.id);
    expect(badge?.next?.name).toBe('Lua Nova');
  });

  it('the options tag the current phase (repeat it) and the one the cycle follows to', () => {
    const [badge] = cycleBadgesOf([moonCycle({ current: 1, chosen: 3 })], VHARN_SCENE.id);
    expect(badge?.options.map(({ name, tag, isNext }) => [name, tag, isNext])).toEqual([
      ['Lua Nova', null, false],
      ['Crescente', 'current', false],
      ['Lua Cheia', 'follows', false],
      ['Minguante', null, true],
    ]);
    expect(badge?.options[3]?.phaseId).toBe(MOON_PHASE_IDS[3]);
  });

  it('a cycle in combat on another grid or in no combat shows no badge here', () => {
    const elsewhere = moonCycle({ sceneId: OTHER_SCENE });
    const idle = moonCycle({ combats: [] });
    expect(cycleBadgesOf([elsewhere, idle], VHARN_SCENE.id)).toEqual([]);
  });
});
