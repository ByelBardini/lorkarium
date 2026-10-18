import { describe, expect, it } from 'vitest';
import { parseSightFields, sightCellsHint, sightFieldsOf } from '@/lib/sight-form';

const METERS = { cellDistance: 1.5, cellUnit: 'm' };
const FEET = { cellDistance: 5, cellUnit: 'ft' };

function seeing(bright: string, dim: string) {
  return { sees: true, bright, dim, saved: false };
}

describe('parseSightFields', () => {
  it('"18" and "6" meters in a 1.5 m scene are bright 12 and dim 4 cells', () => {
    expect(parseSightFields(seeing('18', '6'), METERS)).toEqual({
      ok: true,
      sight: { bright: 12, dim: 4 },
    });
  });

  it('"10" meters is 6.67 cells, to the hundredth', () => {
    expect(parseSightFields(seeing('10', '0'), METERS)).toEqual({
      ok: true,
      sight: { bright: 6.67, dim: 0 },
    });
  });

  it.each(['1,5', '1.5'])('"%s" meters is one cell', (typed) => {
    expect(parseSightFields(seeing(typed, typed), METERS)).toEqual({
      ok: true,
      sight: { bright: 1, dim: 1 },
    });
  });

  it.each(['−1', '151'])('a bright of "%s" is refused with "De 0 a 150 m."', (typed) => {
    expect(parseSightFields(seeing(typed, '0'), METERS)).toEqual({
      ok: false,
      errors: { bright: 'De 0 a 150 m.' },
    });
  });

  it('a dim of "151" is refused on the dim field', () => {
    expect(parseSightFields(seeing('3', '151'), METERS)).toEqual({
      ok: false,
      errors: { dim: 'De 0 a 150 m.' },
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
    expect(parseSightFields(seeing('60', '0'), FEET)).toMatchObject({ sight: { bright: 12 } });
  });

  it('a token that saw and is no longer "Enxerga" sends null; one that never saw sends nothing', () => {
    const cleared = { sees: false, bright: '18', dim: '6', saved: true };
    const never = { sees: false, bright: '', dim: '', saved: false };

    expect(parseSightFields(cleared, METERS)).toEqual({ ok: true, sight: null });
    expect(parseSightFields(never, METERS)).toEqual({ ok: true, sight: undefined });
  });
});

describe('sightFieldsOf', () => {
  it('a sight of 12 and 4 cells shows "18" and "6" in a 1.5 m scene', () => {
    expect(sightFieldsOf({ bright: 12, dim: 4 }, METERS)).toEqual({
      sees: true,
      bright: '18',
      dim: '6',
      saved: true,
    });
  });

  it('no sight is "Enxerga" off with empty fields', () => {
    expect(sightFieldsOf(null, METERS)).toEqual({ sees: false, bright: '', dim: '', saved: false });
  });
});

describe('sightCellsHint', () => {
  it('"18" meters in a 1.5 m scene reads "= 12 casas"', () => {
    expect(sightCellsHint('18', METERS)).toBe('= 12 casas');
  });

  it('"10" meters reads "= 6,67 casas", and nothing typed reads nothing', () => {
    expect(sightCellsHint('10', METERS)).toBe('= 6,67 casas');
    expect(sightCellsHint('', METERS)).toBeNull();
  });
});
