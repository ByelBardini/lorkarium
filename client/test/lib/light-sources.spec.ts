import { describe, expect, it } from 'vitest';
import { lightSourcesOf } from '@/lib/light-sources';
import { brazier, corridorTorch } from '../support/light-fixtures';
import { LYRA_ID, kael, lyra, vharnBoard } from '../support/table-session-fixtures';

const TORCH = { bright: 4, dim: 4 };

describe('lightSourcesOf', () => {
  it('gives the lit map lights and the lit token lights, from their point and footprint center', () => {
    const board = vharnBoard({
      lights: [corridorTorch()],
      tokens: [lyra({ col: 3, row: 4, light: { bright: 2, dim: 1 }, lightLit: true })],
    });

    expect(lightSourcesOf(board)).toEqual([
      { center: { x: 5, y: 5 }, range: { bright: 4, dim: 4 } },
      { center: { x: 3.5, y: 4.5 }, range: { bright: 2, dim: 1 } },
    ]);
  });

  it('leaves out a map light that is out, a token light that is out and a token without light', () => {
    const board = vharnBoard({
      lights: [corridorTorch({ lit: false }), brazier()],
      tokens: [lyra({ light: TORCH, lightLit: false }), kael({ light: null })],
    });

    expect(lightSourcesOf(board)).toEqual([
      { center: { x: 12, y: 8 }, range: { bright: 2, dim: 6 } },
    ]);
  });

  it('the light of a dragged Lyra shines from the cell where she would land', () => {
    const board = vharnBoard({ tokens: [lyra({ col: 3, row: 4, light: TORCH, lightLit: true })] });
    const landing = new Map([[LYRA_ID, { col: 8, row: 2 }]]);

    expect(lightSourcesOf(board, landing)).toEqual([
      { center: { x: 8.5, y: 2.5 }, range: { bright: 4, dim: 4 } },
    ]);
  });
});
