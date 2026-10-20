import { describe, expect, it } from 'vitest';
import { defaultSightFields, parseSightFields, sightFieldsOf } from '@/lib/sight-form';

const METERS = { cellDistance: 1.5, cellUnit: 'm' };
const FEET = { cellDistance: 5, cellUnit: 'ft' };

function seeing(bright: string, dim: string) {
  return { sees: true, bright, dim, saved: false };
}

describe('parseSightFields', () => {
  it('bright until "18" and dim until "24" meters in a 1.5 m scene are 12 + 4 cells', () => {
    expect(parseSightFields(seeing('18', '24'), METERS)).toEqual({
      ok: true,
      sight: { bright: 12, dim: 4 },
    });
  });

  it('"10" meters is 6.67 cells, to the hundredth', () => {
    expect(parseSightFields(seeing('10', ''), METERS)).toEqual({
      ok: true,
      sight: { bright: 6.67, dim: 0 },
    });
  });

  it.each(['1,5', '1.5'])('"%s" meters is one cell', (typed) => {
    expect(parseSightFields(seeing(typed, '3'), METERS)).toEqual({
      ok: true,
      sight: { bright: 1, dim: 1 },
    });
  });

  it.each(['−1', '151'])('a bright of "%s" is refused with "De 0 a 150 m."', (typed) => {
    expect(parseSightFields(seeing(typed, ''), METERS)).toEqual({
      ok: false,
      errors: { bright: 'De 0 a 150 m.' },
    });
  });

  it('a dim until past 100 cells beyond the bright is refused on the dim field', () => {
    expect(parseSightFields(seeing('3', '154'), METERS)).toEqual({
      ok: false,
      errors: { dim: 'De 3 a 153 m.' },
    });
  });

  it('"Enxerga" with an empty bright asks for it; an empty dim counts as none', () => {
    expect(parseSightFields(seeing('', ''), METERS)).toEqual({
      ok: false,
      errors: { bright: 'Informe a visão plena.' },
    });
    expect(parseSightFields(seeing('3', ''), METERS)).toEqual({
      ok: true,
      sight: { bright: 2, dim: 0 },
    });
  });

  it('in a scene of 5 ft cells, "60" feet is 12 cells', () => {
    expect(parseSightFields(seeing('60', ''), FEET)).toMatchObject({ sight: { bright: 12 } });
  });

  it('a token that saw and is no longer "Enxerga" sends null; one that never saw sends nothing', () => {
    const cleared = { sees: false, bright: '18', dim: '24', saved: true };
    const never = { sees: false, bright: '', dim: '', saved: false };

    expect(parseSightFields(cleared, METERS)).toEqual({ ok: true, sight: null });
    expect(parseSightFields(never, METERS)).toEqual({ ok: true, sight: undefined });
  });

  it('the default sight, untouched, is 6 + 6 cells', () => {
    expect(parseSightFields(defaultSightFields(METERS), METERS)).toEqual({
      ok: true,
      sight: { bright: 6, dim: 6 },
    });
  });
});

describe('sightFieldsOf', () => {
  it('a sight of 12 + 4 cells shows "18" and "24" in a 1.5 m scene', () => {
    expect(sightFieldsOf({ bright: 12, dim: 4 }, METERS)).toEqual({
      sees: true,
      bright: '18',
      dim: '24',
      saved: true,
    });
  });

  it('no sight is "Enxerga" off with empty fields', () => {
    expect(sightFieldsOf(null, METERS)).toEqual({ sees: false, bright: '', dim: '', saved: false });
  });
});

describe('defaultSightFields', () => {
  it('a new token sees in the dark until 9 m and dim until 18 m in a 1.5 m scene, not yet saved', () => {
    expect(defaultSightFields(METERS)).toEqual({
      sees: true,
      bright: '9',
      dim: '18',
      saved: false,
    });
  });

  it('in a scene of 5 ft cells, the default reads "30" and "60" feet', () => {
    expect(defaultSightFields(FEET)).toMatchObject({ bright: '30', dim: '60' });
  });
});
