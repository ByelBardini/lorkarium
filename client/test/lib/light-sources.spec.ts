import { describe, expect, it } from 'vitest';
import { lightSourcesOf, shiningLightsOf } from '@/lib/light-sources';
import { brazier, corridorTorch, veiledTorch } from '../support/light-fixtures';
import { LYRA_ID, kael, lyra, vharnBoard } from '../support/table-session-fixtures';

const TORCH = { bright: 4, dim: 4, color: null, angle: 360 };

describe('lightSourcesOf', () => {
  it('gives the lit map lights and the lit token lights, from their point and footprint center', () => {
    const board = vharnBoard({
      lights: [corridorTorch()],
      tokens: [
        lyra({
          col: 3,
          row: 4,
          light: { bright: 2, dim: 1, color: null, angle: 360 },
          lightLit: true,
        }),
      ],
    });

    expect(lightSourcesOf(board)).toEqual([
      { center: { x: 5, y: 5 }, range: { bright: 4, dim: 4 }, cone: null },
      { center: { x: 3.5, y: 4.5 }, range: { bright: 2, dim: 1 }, cone: null },
    ]);
  });

  it('leaves out a map light that is out, a token light that is out and a token without light', () => {
    const board = vharnBoard({
      lights: [corridorTorch({ lit: false }), brazier()],
      tokens: [lyra({ light: TORCH, lightLit: false }), kael({ light: null })],
    });

    expect(lightSourcesOf(board)).toEqual([
      { center: { x: 12, y: 8 }, range: { bright: 2, dim: 6 }, cone: null },
    ]);
  });

  it('the light of a dragged Lyra shines from the cell where she would land', () => {
    const board = vharnBoard({ tokens: [lyra({ col: 3, row: 4, light: TORCH, lightLit: true })] });
    const landing = new Map([[LYRA_ID, { col: 8, row: 2, facing: 0 }]]);

    expect(lightSourcesOf(board, landing)).toEqual([
      { center: { x: 8.5, y: 2.5 }, range: { bright: 4, dim: 4 }, cone: null },
    ]);
  });
});

describe('shiningLightsOf', () => {
  it('gives each lit light with its color: a fire torch and a moon Lyra', () => {
    const board = vharnBoard({
      lights: [corridorTorch({ color: 'fire' })],
      tokens: [lyra({ col: 3, row: 4, light: { ...TORCH, color: 'moon' }, lightLit: true })],
    });

    expect(shiningLightsOf(board)).toEqual([
      {
        source: { center: { x: 5, y: 5 }, range: { bright: 4, dim: 4 }, cone: null },
        color: 'fire',
      },
      {
        source: { center: { x: 3.5, y: 4.5 }, range: { bright: 4, dim: 4 }, cone: null },
        color: 'moon',
      },
    ]);
  });

  it('leaves out a colored light that is out', () => {
    const board = vharnBoard({ lights: [corridorTorch({ color: 'fire', lit: false })] });

    expect(shiningLightsOf(board)).toEqual([]);
  });

  it('the colored light of a dragged Lyra shines from where she would land', () => {
    const board = vharnBoard({
      tokens: [lyra({ col: 3, row: 4, light: { ...TORCH, color: 'moon' }, lightLit: true })],
    });
    const landing = new Map([[LYRA_ID, { col: 8, row: 2, facing: 0 }]]);

    expect(shiningLightsOf(board, landing).map(({ source }) => source.center)).toEqual([
      { x: 8.5, y: 2.5 },
    ]);
  });
});

describe('lightSourcesOf in a cone', () => {
  const LANTERN = { bright: 6, dim: 0, color: null, angle: 60 };

  it('the lantern of Lyra shines in the direction she shows, turned before the ack', () => {
    const board = vharnBoard({ tokens: [lyra({ light: LANTERN, lightLit: true, facing: 0 })] });
    const turned = new Map([[LYRA_ID, { col: 3, row: 4, facing: 180 }]]);

    expect(lightSourcesOf(board).map(({ cone }) => cone)).toEqual([{ facing: 0, angle: 60 }]);
    expect(lightSourcesOf(board, turned).map(({ cone }) => cone)).toEqual([
      { facing: 180, angle: 60 },
    ]);
  });

  it('a spotlight of the map shines with its own facing and angle', () => {
    const board = vharnBoard({ lights: [corridorTorch({ facing: 90, angle: 45 })] });

    expect(lightSourcesOf(board)[0]?.cone).toEqual({ facing: 90, angle: 45 });
  });

  it('a light of 360° shines every side (cone null)', () => {
    const board = vharnBoard({ lights: [corridorTorch({ facing: 90 })] });

    expect(lightSourcesOf(board)[0]?.cone).toBeNull();
  });
});

describe('lightSourcesOf with the lights of hidden tokens', () => {
  it('a veiled light shines from the center the server sent, after the map and token lights', () => {
    const board = vharnBoard({
      lights: [corridorTorch()],
      tokens: [lyra({ col: 3, row: 4, light: TORCH, lightLit: true })],
      veiledLights: [veiledTorch({ x: 8, y: 2.5, color: 'infernal' })],
    });

    expect(shiningLightsOf(board).map(({ source, color }) => [source.center, color])).toEqual([
      [{ x: 5, y: 5 }, null],
      [{ x: 3.5, y: 4.5 }, null],
      [{ x: 8, y: 2.5 }, 'infernal'],
    ]);
  });

  it('a veiled lantern shines in its own cone, with its range', () => {
    const board = vharnBoard({
      veiledLights: [veiledTorch({ bright: 6, dim: 0, facing: 90, angle: 60 })],
    });

    expect(lightSourcesOf(board)).toEqual([
      { center: { x: 4, y: 5 }, range: { bright: 6, dim: 0 }, cone: { facing: 90, angle: 60 } },
    ]);
  });
});
