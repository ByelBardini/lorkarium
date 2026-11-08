import { describe, expect, it } from 'vitest';
import { shownCellsOf, type ShownCellsInput } from '@/lib/shown-cells';
import { KAEL_ID, LYRA_ID, kael, lyra } from '../support/table-session-fixtures';

// Caio's Bram is played here by Kael's id: any token another person drags. Lyra stands at (3, 4)
// and Bram looks down (90).
const BRAM_ID = KAEL_ID;
const NOTHING: ShownCellsInput = {
  dragged: {},
  preview: [],
  drag: null,
  facingPreview: {},
  tokens: [lyra(), kael({ facing: 90 })],
};

describe('shownCellsOf', () => {
  it('a token Caio drags shows on the cell it is dragged over, looking where it looks', () => {
    const shown = shownCellsOf({ ...NOTHING, dragged: { [BRAM_ID]: { col: 8, row: 4 } } });

    expect(shown).toEqual(new Map([[BRAM_ID, { col: 8, row: 4, facing: 90 }]]));
  });

  it('a token Bia drags shows where it would land', () => {
    const drag = { landing: [{ tokenId: LYRA_ID, col: 6, row: 4 }] };

    expect(shownCellsOf({ ...NOTHING, drag })).toEqual(
      new Map([[LYRA_ID, { col: 6, row: 4, facing: 0 }]]),
    );
  });

  it('a token Bia dropped shows where she dropped it while the server has not answered', () => {
    const preview = [{ tokenId: LYRA_ID, col: 6, row: 4 }];

    expect(shownCellsOf({ ...NOTHING, preview })).toEqual(
      new Map([[LYRA_ID, { col: 6, row: 4, facing: 0 }]]),
    );
  });

  it('Bia’s own drag wins over the master dragging the same token', () => {
    const shown = shownCellsOf({
      ...NOTHING,
      dragged: { [LYRA_ID]: { col: 9, row: 4 } },
      drag: { landing: [{ tokenId: LYRA_ID, col: 6, row: 4 }] },
    });

    expect(shown.get(LYRA_ID)).toEqual({ col: 6, row: 4, facing: 0 });
  });

  it('a drag where a member would leave the scene shows none of its members, and Bram stays', () => {
    const shown = shownCellsOf({
      ...NOTHING,
      dragged: { [BRAM_ID]: { col: 8, row: 4 } },
      drag: { landing: null },
    });

    expect(shown).toEqual(new Map([[BRAM_ID, { col: 8, row: 4, facing: 90 }]]));
  });

  it('Lyra turned around by Bia (180) shows on her confirmed cell looking left', () => {
    const shown = shownCellsOf({ ...NOTHING, facingPreview: { [LYRA_ID]: 180 } });

    expect(shown).toEqual(new Map([[LYRA_ID, { col: 3, row: 4, facing: 180 }]]));
  });

  it('Lyra dragged and turned at once shows on the dragged cell looking where she turns', () => {
    const shown = shownCellsOf({
      ...NOTHING,
      drag: { landing: [{ tokenId: LYRA_ID, col: 6, row: 4 }] },
      facingPreview: { [LYRA_ID]: 180 },
    });

    expect(shown.get(LYRA_ID)).toEqual({ col: 6, row: 4, facing: 180 });
  });

  it('a turn of a token that is not on the board changes nothing', () => {
    const stranger = 'dd44ee55-ff66-4a77-8b88-223344556677';

    expect(shownCellsOf({ ...NOTHING, facingPreview: { [stranger]: 90 } }).size).toBe(0);
  });

  it('with nothing dragged, waiting nor turning the map is empty', () => {
    expect(shownCellsOf(NOTHING).size).toBe(0);
  });
});

describe('shownCellsOf with patrols', () => {
  const patrols = new Map([[LYRA_ID, { col: 7, row: 2, facing: 270, glideMs: 1000 }]]);

  it('a token on patrol shows on its patrol cell, looking where it walks', () => {
    expect(shownCellsOf({ ...NOTHING, patrols })).toEqual(
      new Map([[LYRA_ID, { col: 7, row: 2, facing: 270 }]]),
    );
  });

  it('a patrol that does not turn keeps the token’s own facing (Bram looks down)', () => {
    const still = new Map([[BRAM_ID, { col: 7, row: 2, facing: null, glideMs: 1000 }]]);

    expect(shownCellsOf({ ...NOTHING, patrols: still }).get(BRAM_ID)).toEqual({
      col: 7,
      row: 2,
      facing: 90,
    });
  });

  it('the master dragging the patrolling Lyra wins over the patrol cell', () => {
    const shown = shownCellsOf({ ...NOTHING, patrols, dragged: { [LYRA_ID]: { col: 9, row: 4 } } });

    expect(shown.get(LYRA_ID)).toMatchObject({ col: 9, row: 4 });
  });

  it('Bia’s own drag of the patrolling Lyra wins over the patrol cell', () => {
    const drag = { landing: [{ tokenId: LYRA_ID, col: 6, row: 4 }] };

    expect(shownCellsOf({ ...NOTHING, patrols, drag }).get(LYRA_ID)).toMatchObject({
      col: 6,
      row: 4,
    });
  });

  it('a turn before the ack wins over the patrol facing', () => {
    const shown = shownCellsOf({ ...NOTHING, patrols, facingPreview: { [LYRA_ID]: 45 } });

    expect(shown.get(LYRA_ID)).toEqual({ col: 7, row: 2, facing: 45 });
  });
});
