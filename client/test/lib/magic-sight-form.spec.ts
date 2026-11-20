import { describe, expect, it } from 'vitest';
import {
  NO_MAGIC_SIGHT_FIELDS,
  magicSightFieldsOf,
  parseMagicSightFields,
} from '@/lib/magic-sight-form';

const METERS = { cellDistance: 1.5, cellUnit: 'm' };

describe('magicSightFieldsOf', () => {
  it('4 cells in a scene of 1.5 m shows on, "6" and saved', () => {
    expect(magicSightFieldsOf(4, METERS)).toEqual({ on: true, reach: '6', saved: true });
  });

  it('no magic sight shows off and empty', () => {
    expect(magicSightFieldsOf(null, METERS)).toEqual(NO_MAGIC_SIGHT_FIELDS);
  });
});

describe('parseMagicSightFields', () => {
  it('on with "9" m sends 6 cells; "1,5" with a comma sends 1', () => {
    expect(parseMagicSightFields({ on: true, reach: '9', saved: false }, METERS)).toEqual({
      ok: true,
      magicSight: 6,
    });
    expect(parseMagicSightFields({ on: true, reach: '1,5', saved: false }, METERS)).toEqual({
      ok: true,
      magicSight: 1,
    });
  });

  it('off on a token that had it sends null; off on one that never had it sends nothing', () => {
    expect(parseMagicSightFields({ on: false, reach: '6', saved: true }, METERS)).toEqual({
      ok: true,
      magicSight: null,
    });
    expect(parseMagicSightFields(NO_MAGIC_SIGHT_FIELDS, METERS)).toEqual({
      ok: true,
      magicSight: undefined,
    });
  });

  it('"151" m is past 100 cells: "De 0 a 150 m."', () => {
    expect(parseMagicSightFields({ on: true, reach: '151', saved: false }, METERS)).toEqual({
      ok: false,
      error: 'De 0 a 150 m.',
    });
  });

  it('on and empty asks for the reach', () => {
    expect(parseMagicSightFields({ on: true, reach: ' ', saved: false }, METERS)).toEqual({
      ok: false,
      error: 'Informe o alcance da visão mágica.',
    });
  });
});
