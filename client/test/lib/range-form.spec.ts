import { describe, expect, it } from 'vitest';
import { parseRangeFields, rangeCellsHint, rangeFieldsOf } from '@/lib/range-form';

const METERS = { cellDistance: 1.5, cellUnit: 'm' };
const LIGHT_TEXTS = { missingBright: 'Informe a luz plena.' };

function lit(bright: string, dim: string) {
  return { on: true, bright, dim, saved: false };
}

describe('parseRangeFields', () => {
  it('"6" and "6" meters in a 1.5 m scene are bright 4 and dim 4 cells (a torch)', () => {
    expect(parseRangeFields(lit('6', '6'), METERS, LIGHT_TEXTS)).toEqual({
      ok: true,
      range: { bright: 4, dim: 4 },
    });
  });

  it('"10" meters is 6.67 cells, to the hundredth', () => {
    expect(parseRangeFields(lit('10', '0'), METERS, LIGHT_TEXTS)).toEqual({
      ok: true,
      range: { bright: 6.67, dim: 0 },
    });
  });

  it.each(['1,5', '1.5'])('"%s" meters is one cell', (typed) => {
    expect(parseRangeFields(lit(typed, typed), METERS, LIGHT_TEXTS)).toEqual({
      ok: true,
      range: { bright: 1, dim: 1 },
    });
  });

  it('an empty bright asks for it with the text of the caller', () => {
    expect(parseRangeFields(lit('', '6'), METERS, LIGHT_TEXTS)).toEqual({
      ok: false,
      errors: { bright: 'Informe a luz plena.' },
    });
  });

  it('an empty dim counts as none', () => {
    expect(parseRangeFields(lit('6', ''), METERS, LIGHT_TEXTS)).toEqual({
      ok: true,
      range: { bright: 4, dim: 0 },
    });
  });

  it('a bright of "151" meters is refused with "De 0 a 150 m."', () => {
    expect(parseRangeFields(lit('151', '0'), METERS, LIGHT_TEXTS)).toEqual({
      ok: false,
      errors: { bright: 'De 0 a 150 m.' },
    });
  });

  it('a range that was saved and is switched off sends null; one never saved sends nothing', () => {
    const cleared = { on: false, bright: '6', dim: '6', saved: true };
    const never = { on: false, bright: '', dim: '', saved: false };

    expect(parseRangeFields(cleared, METERS, LIGHT_TEXTS)).toEqual({ ok: true, range: null });
    expect(parseRangeFields(never, METERS, LIGHT_TEXTS)).toEqual({ ok: true, range: undefined });
  });
});

describe('rangeFieldsOf', () => {
  it('a range of 4 and 4 cells shows "6" and "6" in a 1.5 m scene, switched on and saved', () => {
    expect(rangeFieldsOf({ bright: 4, dim: 4 }, METERS)).toEqual({
      on: true,
      bright: '6',
      dim: '6',
      saved: true,
    });
  });

  it('no range is switched off with empty fields', () => {
    expect(rangeFieldsOf(null, METERS)).toEqual({ on: false, bright: '', dim: '', saved: false });
  });
});

describe('rangeCellsHint', () => {
  it('"6" meters in a 1.5 m scene reads "= 4 casas"', () => {
    expect(rangeCellsHint('6', METERS)).toBe('= 4 casas');
  });

  it('"1,5" meters reads "= 1 casa"', () => {
    expect(rangeCellsHint('1,5', METERS)).toBe('= 1 casa');
  });

  it('"10" meters reads "= 6,67 casas", and nothing typed reads nothing', () => {
    expect(rangeCellsHint('10', METERS)).toBe('= 6,67 casas');
    expect(rangeCellsHint('', METERS)).toBeNull();
  });

  it('an unreadable distance gives no hint', () => {
    expect(rangeCellsHint('seis', METERS)).toBeNull();
  });
});
