import { effectArea } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { EffectAreaRulesBo } from '../../../src/modules/effect-areas/effect-area-rules.bo';
import { BIA_CONE_ID, BIA_CONE_SHAPE } from '../../support/effect-areas-factories';

const rules = new EffectAreaRulesBo({ scene: { widthCells: 20, heightCells: 12 }, limit: 100 });

describe('EffectAreaRulesBo.place', () => {
  it('an origin on the far corner of the scene fits (the edge counts)', () => {
    const area = effectArea({ kind: 'circle', x: 20, y: 12, reach: 3, color: 'ember' });
    expect(rules.place(area)).toEqual(area);
  });

  it('an origin past the right edge is refused with OUT_OF_SCENE citing the origin and the scene', () => {
    const area = effectArea({ kind: 'circle', x: 21, y: 3, reach: 3, color: 'ember' });
    expect(() => rules.place(area)).toThrow(
      expect.objectContaining({
        code: 'OUT_OF_SCENE',
        message: expect.stringMatching(/\(21, 3\) .*20×12 scene/),
      }),
    );
  });
});

describe('EffectAreaRulesBo.admit', () => {
  it('the 100th area of a scene is admitted', () => {
    expect(() => rules.admit(99, 1)).not.toThrow();
  });

  it('the 101st area is refused with EFFECT_AREA_LIMIT citing the count and the limit', () => {
    expect(() => rules.admit(100, 1)).toThrow(
      expect.objectContaining({
        code: 'EFFECT_AREA_LIMIT',
        message: expect.stringMatching(/has 100 effect areas; adding 1 .*limit of 100/),
      }),
    );
  });
});

describe('EffectAreaRulesBo.requireShape', () => {
  it('a command with no expected shape always passes', () => {
    expect(() => rules.requireShape(BIA_CONE_ID, undefined, BIA_CONE_SHAPE)).not.toThrow();
  });

  it('an expected reach of 3 on an area of reach 4 is refused with STALE_UNDO citing both', () => {
    const grown = { ...BIA_CONE_SHAPE, reach: 4 };
    expect(() => rules.requireShape(BIA_CONE_ID, BIA_CONE_SHAPE, grown)).toThrow(
      expect.objectContaining({
        code: 'STALE_UNDO',
        message: expect.stringMatching(
          new RegExp(`effect area ${BIA_CONE_ID} is at .*reach 4.*expected .*reach 3`),
        ),
      }),
    );
  });

  it('an expected shape equal to the hundredth passes', () => {
    const smooth = { kind: 'smooth_circle', x: 5.23, y: 4.87, reach: 2.27, color: 'gold' } as const;
    expect(() =>
      rules.requireShape(BIA_CONE_ID, smooth, { ...smooth, x: 5.2300001 }),
    ).not.toThrow();
  });

  it('an expected shape of another kind is refused even with the same numbers', () => {
    const semicircle = { ...BIA_CONE_SHAPE, kind: 'semicircle', x: 5, y: 5 } as const;
    const line = { ...semicircle, kind: 'line' } as const;
    expect(() => rules.requireShape(BIA_CONE_ID, semicircle, line)).toThrow(
      expect.objectContaining({ code: 'STALE_UNDO' }),
    );
  });

  it('an expected color other than the current one is refused', () => {
    expect(() =>
      rules.requireShape(BIA_CONE_ID, BIA_CONE_SHAPE, { ...BIA_CONE_SHAPE, color: 'moss' }),
    ).toThrow(expect.objectContaining({ code: 'STALE_UNDO' }));
  });
});
