import { ASSET_MAX_SIDE, PLAN_LIMITS } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  LOOSE_ASSET_GRACE_MS,
  looseCutoffOf,
  planSidesOf,
} from '../../../src/modules/assets/asset-quota.bo';

describe('planSidesOf', () => {
  it('free keeps the map at 4096 px and the background at 2048 px', () => {
    const sides = planSidesOf(ASSET_MAX_SIDE, PLAN_LIMITS.free);

    expect(sides.library_map).toBe(4096);
    expect(sides.background).toBe(2048);
  });

  it('narrador keeps the technical sides of the map and the background', () => {
    const sides = planSidesOf(ASSET_MAX_SIDE, PLAN_LIMITS.narrador);

    expect(sides.library_map).toBe(8192);
    expect(sides.background).toBe(4096);
  });

  it('a plan side above the technical one never raises it', () => {
    const sides = planSidesOf(ASSET_MAX_SIDE, { maxMapSide: 20_000, maxBackgroundSide: 9000 });

    expect(sides.library_map).toBe(ASSET_MAX_SIDE.library_map);
    expect(sides.background).toBe(ASSET_MAX_SIDE.background);
  });

  it('every other purpose keeps its technical side on free', () => {
    const sides = planSidesOf(ASSET_MAX_SIDE, PLAN_LIMITS.free);

    expect({ ...sides, library_map: 0, background: 0 }).toEqual({
      ...ASSET_MAX_SIDE,
      library_map: 0,
      background: 0,
    });
  });
});

describe('looseCutoffOf', () => {
  it('is 24 hours before now', () => {
    expect(looseCutoffOf(new Date('2026-11-11T12:00:00Z'))).toEqual(
      new Date('2026-11-10T12:00:00Z'),
    );
    expect(LOOSE_ASSET_GRACE_MS).toBe(86_400_000);
  });
});
