import { describe, expect, it } from 'vitest';
import { lockTableIfCycles, turnedRow } from '../../../src/modules/combat/combat-cycles-sync';
import type { CombatRow } from '../../../src/modules/combat/combat.dao';
import { roundCycleRow } from '../../support/round-cycles-factories';
import { RoundCyclesDaoFake } from '../../support/round-cycles-fakes';
import { scenePo } from '../../support/scenes-factories';

const row: CombatRow = {
  combat: {
    id: 'combat-1',
    sceneId: 'scene-1',
    round: 2,
    currentCombatantId: 'c-ogro',
    startedAt: new Date('2026-11-25T21:00:00Z'),
  },
  combatants: [],
};

describe('turnedRow', () => {
  it('keeps the entries and takes the new round and turn', () => {
    const turned = turnedRow(row, { round: 3, currentId: 'c-kael' });
    expect([turned?.combat.round, turned?.combat.currentCombatantId]).toEqual([3, 'c-kael']);
    expect(turned?.combatants).toBe(row.combatants);
  });

  it('no combat stays no combat', () => {
    expect(turnedRow(undefined, { round: 1, currentId: null })).toBeUndefined();
  });
});

describe('lockTableIfCycles', () => {
  const scene = { ...scenePo(), campaignId: 'campaign-1' };

  it('a table with a cycle asks for the table stream lock (the rerun signal)', async () => {
    const roundCycles = new RoundCyclesDaoFake();
    roundCycles.rows.push(roundCycleRow());
    const locked = { daos: {}, scene: { ...scene, version: 1 }, characters: null } as never;

    await expect(lockTableIfCycles(locked, { roundCycles }, 'campaign-1')).rejects.toThrow(
      /runs again locking them/,
    );
  });

  it('a table without cycles goes on without it', async () => {
    const locked = { daos: {}, scene: { ...scene, version: 1 }, characters: null } as never;
    const work = lockTableIfCycles(locked, { roundCycles: new RoundCyclesDaoFake() }, 'campaign-1');

    await expect(work).resolves.toBe(false);
  });
});
