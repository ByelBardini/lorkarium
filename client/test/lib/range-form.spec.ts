import { describe, expect, it } from 'vitest';
import { parseRangeFields, rangeCellsHint, rangeFieldsOf } from '@/lib/range-form';

const METERS = { cellDistance: 1.5, cellUnit: 'm' };
const FEET = { cellDistance: 5, cellUnit: 'ft' };
const LIGHT_TEXTS = { missingBright: 'Informe a luz plena.' };

function lit(bright: string, dim: string) {
  return { on: true, bright, dim, saved: false };
}

describe('parseRangeFields', () => {
  it('bright until "6" and dim until "12" meters in a 1.5 m scene are 4 + 4 cells (a torch)', () => {
    expect(parseRangeFields(lit('6', '12'), METERS, LIGHT_TEXTS)).toEqual({
      ok: true,
      range: { bright: 4, dim: 4 },
    });
  });

  it('bright until "9" and dim until "18" meters are 6 + 6 cells', () => {
    expect(parseRangeFields(lit('9', '18'), METERS, LIGHT_TEXTS)).toEqual({
      ok: true,
      range: { bright: 6, dim: 6 },
    });
  });

  it('"10" and "20" meters, off the cell, are 6.67 and 6.66 cells: dim is until minus bright', () => {
    expect(parseRangeFields(lit('10', '20'), METERS, LIGHT_TEXTS)).toEqual({
      ok: true,
      range: { bright: 6.67, dim: 6.66 },
    });
  });

  it.each(['1,5', '1.5'])('"%s" meters is one cell', (typed) => {
    expect(parseRangeFields(lit(typed, '3'), METERS, LIGHT_TEXTS)).toEqual({
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

  it('a dim until equal to the bright counts as none', () => {
    expect(parseRangeFields(lit('9', '9'), METERS, LIGHT_TEXTS)).toEqual({
      ok: true,
      range: { bright: 6, dim: 0 },
    });
  });

  it('a dim until short of the bright is refused on the dim with "De 9 a 159 m."', () => {
    expect(parseRangeFields(lit('9', '6'), METERS, LIGHT_TEXTS)).toEqual({
      ok: false,
      errors: { dim: 'De 9 a 159 m.' },
    });
  });

  it('a dim band past 100 cells ("9" until "160") is refused with "De 9 a 159 m."', () => {
    expect(parseRangeFields(lit('9', '160'), METERS, LIGHT_TEXTS)).toEqual({
      ok: false,
      errors: { dim: 'De 9 a 159 m.' },
    });
  });

  it('a bright of "151" meters is refused with "De 0 a 150 m." and the dim is not checked', () => {
    expect(parseRangeFields(lit('151', '6'), METERS, LIGHT_TEXTS)).toEqual({
      ok: false,
      errors: { bright: 'De 0 a 150 m.' },
    });
  });

  it('a range that was saved and is switched off sends null; one never saved sends nothing', () => {
    const cleared = { on: false, bright: '6', dim: '12', saved: true };
    const never = { on: false, bright: '', dim: '', saved: false };

    expect(parseRangeFields(cleared, METERS, LIGHT_TEXTS)).toEqual({ ok: true, range: null });
    expect(parseRangeFields(never, METERS, LIGHT_TEXTS)).toEqual({ ok: true, range: undefined });
  });
});

describe('rangeFieldsOf', () => {
  it('4 + 4 cells shows bright until "6" and dim until "12" in a 1.5 m scene, on and saved', () => {
    expect(rangeFieldsOf({ bright: 4, dim: 4 }, METERS)).toEqual({
      on: true,
      bright: '6',
      dim: '12',
      saved: true,
    });
  });

  it('6 + 6 cells shows "30" and "60" in a scene of 5 ft cells', () => {
    expect(rangeFieldsOf({ bright: 6, dim: 6 }, FEET)).toMatchObject({ bright: '30', dim: '60' });
  });

  it('6.67 + 6.66 cells reopens as "10" and "20" meters', () => {
    expect(rangeFieldsOf({ bright: 6.67, dim: 6.66 }, METERS)).toMatchObject({
      bright: '10',
      dim: '20',
    });
  });

  it('no dim shows an empty dim until', () => {
    expect(rangeFieldsOf({ bright: 4, dim: 0 }, METERS)).toMatchObject({ bright: '6', dim: '' });
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
