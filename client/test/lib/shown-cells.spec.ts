import { describe, expect, it } from 'vitest';
import { shownCellsOf, type ShownCellsInput } from '@/lib/shown-cells';
import { KAEL_ID, LYRA_ID } from '../support/table-session-fixtures';

// Caio's Bram is played here by Kael's id: any token another person drags.
const BRAM_ID = KAEL_ID;
const NOTHING: ShownCellsInput = { dragged: {}, preview: [], drag: null };

describe('shownCellsOf', () => {
  it('a token Caio drags shows on the cell it is dragged over', () => {
    const shown = shownCellsOf({ ...NOTHING, dragged: { [BRAM_ID]: { col: 8, row: 4 } } });

    expect(shown).toEqual(new Map([[BRAM_ID, { col: 8, row: 4 }]]));
  });

  it('a token Bia drags shows where it would land', () => {
    const drag = { landing: [{ tokenId: LYRA_ID, col: 6, row: 4 }] };

    expect(shownCellsOf({ ...NOTHING, drag })).toEqual(new Map([[LYRA_ID, { col: 6, row: 4 }]]));
  });

  it('a token Bia dropped shows where she dropped it while the server has not answered', () => {
    const preview = [{ tokenId: LYRA_ID, col: 6, row: 4 }];

    expect(shownCellsOf({ ...NOTHING, preview })).toEqual(new Map([[LYRA_ID, { col: 6, row: 4 }]]));
  });

  it('Bia’s own drag wins over the master dragging the same token', () => {
    const shown = shownCellsOf({
      dragged: { [LYRA_ID]: { col: 9, row: 4 } },
      preview: [],
      drag: { landing: [{ tokenId: LYRA_ID, col: 6, row: 4 }] },
    });

    expect(shown.get(LYRA_ID)).toEqual({ col: 6, row: 4 });
  });

  it('a drag where a member would leave the scene shows none of its members, and Bram stays', () => {
    const shown = shownCellsOf({
      dragged: { [BRAM_ID]: { col: 8, row: 4 } },
      preview: [],
      drag: { landing: null },
    });

    expect(shown).toEqual(new Map([[BRAM_ID, { col: 8, row: 4 }]]));
  });

  it('with nothing dragged nor waiting the map is empty', () => {
    expect(shownCellsOf(NOTHING).size).toBe(0);
  });
});
