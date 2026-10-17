import { describe, expect, it } from 'vitest';
import { gridFormOf, parseGridForm, unitOptionsOf } from '@/features/board/grid-form';
import { VHARN_SCENE } from '../../support/table-session-fixtures';

describe('grid form', () => {
  it('starts from the scene, with the distance written in pt-BR', () => {
    expect(gridFormOf(VHARN_SCENE)).toEqual({
      widthCells: '20',
      heightCells: '12',
      cellDistance: '1,5',
      cellUnit: 'm',
      gridVisible: true,
      gridOpacity: '30',
    });
  });

  it('parses "1,5" and "1.5" alike and trims the unit', () => {
    const form = { ...gridFormOf(VHARN_SCENE), cellDistance: ' 2.5 ', cellUnit: ' ft ' };
    expect(parseGridForm(form)).toEqual({
      ok: true,
      grid: { ...VHARN_SCENE_GRID, cellDistance: 2.5, cellUnit: 'ft' },
    });
  });

  it.each([
    ['widthCells', '0', 'Use de 1 a 100 casas.'],
    ['heightCells', '101', 'Use de 1 a 100 casas.'],
    ['widthCells', '2,5', 'Use de 1 a 100 casas.'],
    ['cellDistance', '', 'Use uma distância maior que zero, como 1,5.'],
    ['cellDistance', 'abc', 'Use uma distância maior que zero, como 1,5.'],
    ['cellUnit', 'quadrados', 'Escolha cm, m ou km.'],
    ['gridOpacity', '150', 'Use de 0 a 100.'],
  ] as const)('%s = "%s" reads "%s"', (field, value, message) => {
    const result = parseGridForm({ ...gridFormOf(VHARN_SCENE), [field]: value });
    expect(result).toEqual({ ok: false, errors: { [field]: message } });
  });
});

const VHARN_SCENE_GRID = {
  widthCells: 20,
  heightCells: 12,
  cellDistance: 1.5,
  cellUnit: 'm',
  gridVisible: true,
  gridOpacity: 30,
};

describe('unitOptionsOf', () => {
  it('a scene in m offers cm, m and km', () => {
    expect(unitOptionsOf('m')).toEqual(['cm', 'm', 'km']);
  });

  it('a scene saved in ft keeps ft as one more option', () => {
    expect(unitOptionsOf('ft')).toEqual(['cm', 'm', 'km', 'ft']);
  });
});
