import { PLAN_LIMITS } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { RoundCyclePlanBo } from '../../../src/modules/round-cycles/round-cycle-plan.bo';

const FREE = PLAN_LIMITS.free;
const NARRADOR = PLAN_LIMITS.narrador;
const LENDA = PLAN_LIMITS.lenda;
const UNBOUNDED = PLAN_LIMITS.amigo_do_dono;

const named = (count: number, imageAssetId: string | null = null) =>
  Array.from({ length: count }, (_, i) => ({ id: `phase-${i}`, imageAssetId }));
const fresh = (count: number) => Array.from({ length: count }, () => ({ imageAssetId: null }));

describe('RoundCyclePlanBo.requireCycleRoom', () => {
  it('Grátis keeps 1 cycle: the 2nd is PLAN_LIMIT naming roundCycles and the plan', () => {
    expect(() => RoundCyclePlanBo.requireCycleRoom(0, FREE)).not.toThrow();
    expect(() => RoundCyclePlanBo.requireCycleRoom(1, FREE)).toThrow(
      expect.objectContaining({
        code: 'PLAN_LIMIT',
        resource: 'roundCycles',
        limit: 1,
        plan: 'free',
      }),
    );
  });

  it('Narrador keeps 3 and Lenda 10', () => {
    expect(() => RoundCyclePlanBo.requireCycleRoom(2, NARRADOR)).not.toThrow();
    expect(() => RoundCyclePlanBo.requireCycleRoom(3, NARRADOR)).toThrow(/narrador/);
    expect(() => RoundCyclePlanBo.requireCycleRoom(9, LENDA)).not.toThrow();
    expect(() => RoundCyclePlanBo.requireCycleRoom(10, LENDA)).toThrow(/lenda/);
  });

  it('the technical ceiling (20) is no plan refusal: ROUND_CYCLE_LIMIT says it instead', () => {
    expect(() => RoundCyclePlanBo.requireCycleRoom(20, UNBOUNDED)).not.toThrow();
  });
});

describe('RoundCyclePlanBo.requirePhases', () => {
  it('a new cycle of 4 phases on Grátis is PLAN_LIMIT on roundCyclePhases (plan allows 3)', () => {
    expect(() => RoundCyclePlanBo.requirePhases([], fresh(3), FREE)).not.toThrow();
    expect(() => RoundCyclePlanBo.requirePhases([], fresh(4), FREE)).toThrow(
      expect.objectContaining({ resource: 'roundCyclePhases', limit: 3 }),
    );
  });

  it('Narrador takes 6 phases, not 7; Lenda takes 12', () => {
    expect(() => RoundCyclePlanBo.requirePhases([], fresh(6), NARRADOR)).not.toThrow();
    expect(() => RoundCyclePlanBo.requirePhases([], fresh(7), NARRADOR)).toThrow(/narrador/);
    expect(() => RoundCyclePlanBo.requirePhases([], fresh(12), LENDA)).not.toThrow();
  });

  it('a cycle kept past the plan keeps its phases and may shrink, but not grow', () => {
    expect(() => RoundCyclePlanBo.requirePhases(named(8), named(8), FREE)).not.toThrow();
    expect(() => RoundCyclePlanBo.requirePhases(named(8), named(5), FREE)).not.toThrow();
    expect(() => RoundCyclePlanBo.requirePhases(named(8), named(9), FREE)).toThrow(
      expect.objectContaining({ code: 'PLAN_LIMIT' }),
    );
  });

  it('a new image on Grátis is PLAN_LIMIT on roundCyclePhaseImage with limit 0', () => {
    const phases = [{ imageAssetId: 'img-lua' }, { imageAssetId: null }];
    expect(() => RoundCyclePlanBo.requirePhases([], phases, FREE)).toThrow(
      expect.objectContaining({ resource: 'roundCyclePhaseImage', limit: 0 }),
    );
    expect(() => RoundCyclePlanBo.requirePhases([], phases, NARRADOR)).not.toThrow();
  });

  it('on Grátis the image a phase already has stays, and taking it out passes', () => {
    const saved = named(2, 'img-lua');
    expect(() => RoundCyclePlanBo.requirePhases(saved, saved, FREE)).not.toThrow();
    expect(() => RoundCyclePlanBo.requirePhases(saved, named(2), FREE)).not.toThrow();
  });

  it('on Grátis swapping a saved image, or moving it to another phase id, is refused', () => {
    const saved = named(2, 'img-lua');
    const swapped = [{ id: 'phase-0', imageAssetId: 'img-sol' }, saved[1]!];
    const moved = [{ imageAssetId: 'img-lua' }, saved[1]!];
    expect(() => RoundCyclePlanBo.requirePhases(saved, swapped, FREE)).toThrow(
      /roundCyclePhaseImage/,
    );
    expect(() => RoundCyclePlanBo.requirePhases(saved, moved, FREE)).toThrow(
      /roundCyclePhaseImage/,
    );
  });
});

describe('RoundCyclePlanBo.requireEditable and isLocked', () => {
  it('on Grátis the oldest cycle stays editable and the 2nd is read only', () => {
    expect(RoundCyclePlanBo.isLocked(0, FREE)).toBe(false);
    expect(RoundCyclePlanBo.isLocked(1, FREE)).toBe(true);
    expect(() => RoundCyclePlanBo.requireEditable(1, FREE)).toThrow(
      expect.objectContaining({ reason: 'readOnly', resource: 'roundCycles' }),
    );
  });

  it('above the plans nothing is locked', () => {
    expect(RoundCyclePlanBo.isLocked(19, UNBOUNDED)).toBe(false);
    expect(() => RoundCyclePlanBo.requireEditable(19, UNBOUNDED)).not.toThrow();
  });
});
