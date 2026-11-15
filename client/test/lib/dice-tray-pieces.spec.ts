import { describe, expect, it } from 'vitest';
import {
  EMPTY_TRAY,
  EMPTY_TRAY_CHOICE,
  chooseMode,
  clearTray,
  isTrayEmpty,
  isTrayRollable,
  setLoose,
  toRollParts,
  trayAdvantageBlockOf,
  trayDieCountsOf,
  trayProblemOf,
  type DiceTray,
} from '@/lib/dice-tray';
import {
  addPiece,
  addSavedRoll,
  canAddTrayParts,
  removePiece,
  trayPartCountOf,
} from '@/lib/dice-tray-pieces';
import { ACERTO, BENCAO } from '../support/dice-fixtures';

/** Ids in order (`p1`, `p2`…), so a piece is found by the order it came in. */
function sequentialIds(): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `p${next}`;
  };
}

function trayOfPieces(count: number): DiceTray {
  const newId = sequentialIds();
  let tray = EMPTY_TRAY;
  for (let index = 0; index < count; index += 1) {
    tray = addPiece(tray, { label: `Buff ${index + 1}`, expression: '1d4' }, newId);
  }
  return tray;
}

describe('addPiece', () => {
  it('Acerto 1d20 then Bênção 1d4+5 roll as two labeled parts, in order', () => {
    const newId = sequentialIds();
    const acerto = addPiece(EMPTY_TRAY, { label: 'Acerto', expression: '1d20' }, newId);
    const tray = addPiece(acerto, { label: 'Bênção', expression: '1d4+5' }, newId);
    expect(toRollParts(tray, 'normal')).toEqual([
      { label: 'Acerto', expression: '1d20' },
      { label: 'Bênção', expression: '1d4+5' },
    ]);
    expect(tray.pieces.map((piece) => piece.id)).toEqual(['p1', 'p2']);
  });

  it('the loose formula rolls first, unlabeled', () => {
    const tray = addPiece(
      setLoose(EMPTY_TRAY, '+2'),
      { label: 'Acerto', expression: '1d20' },
      sequentialIds(),
    );
    expect(toRollParts(tray, 'normal')).toEqual([
      { label: null, expression: '+2' },
      { label: 'Acerto', expression: '1d20' },
    ]);
  });

  it('the expression is trimmed', () => {
    const tray = addPiece(EMPTY_TRAY, { label: 'Bênção', expression: '  1d4 ' }, sequentialIds());
    expect(tray.pieces[0]?.expression).toBe('1d4');
  });

  it('an unreadable expression is a RangeError citing it and the expected shape', () => {
    expect(() => addPiece(EMPTY_TRAY, { label: 'X', expression: '2d' }, sequentialIds())).toThrow(
      /Tray piece '2d' is unreadable.*expected dice notation like '1d20\+5'/,
    );
  });

  it('past 10 parts the tray comes back unchanged (the same reference)', () => {
    const full = trayOfPieces(10);
    expect(addPiece(full, { label: 'Mais', expression: '1d4' }, sequentialIds())).toBe(full);
  });

  it('the loose formula counts as one of the 10 parts', () => {
    const tray = { ...trayOfPieces(9), loose: '1d20' };
    expect(addPiece(tray, { label: 'Mais', expression: '1d4' }, sequentialIds())).toBe(tray);
  });
});

describe('addSavedRoll', () => {
  it('copies each part of the saved roll, the unlabeled ones named after it', () => {
    const combo = {
      ...ACERTO,
      name: 'Combo',
      parts: [
        { label: null, expression: '1d20' },
        { label: 'Fogo', expression: '2d6' },
      ],
    };
    const tray = addSavedRoll(EMPTY_TRAY, combo, sequentialIds());
    expect(toRollParts(tray, 'normal')).toEqual([
      { label: 'Combo', expression: '1d20' },
      { label: 'Fogo', expression: '2d6' },
    ]);
  });

  it('Acerto then Bênção: two pieces', () => {
    const newId = sequentialIds();
    const tray = addSavedRoll(addSavedRoll(EMPTY_TRAY, ACERTO, newId), BENCAO, newId);
    expect(tray.pieces.map(({ label, expression }) => `${label} · ${expression}`)).toEqual([
      'Acerto · 1d20+5',
      'Bênção · 1d4',
    ]);
  });

  it('a saved roll that does not fit whole is refused (the same reference)', () => {
    const tray = trayOfPieces(9);
    const two = {
      ...ACERTO,
      parts: [
        { label: null, expression: '1d20' },
        { label: null, expression: '1d4' },
      ],
    };
    expect(addSavedRoll(tray, two, sequentialIds())).toBe(tray);
  });
});

describe('removePiece', () => {
  it('takes only that piece out', () => {
    const newId = sequentialIds();
    const tray = addSavedRoll(addSavedRoll(EMPTY_TRAY, ACERTO, newId), BENCAO, newId);
    expect(removePiece(tray, 'p2').pieces.map((piece) => piece.label)).toEqual(['Acerto']);
  });

  it('an absent id gives the same reference', () => {
    const tray = trayOfPieces(2);
    expect(removePiece(tray, 'nope')).toBe(tray);
  });
});

describe('trayPartCountOf and canAddTrayParts', () => {
  it('counts the pieces and the loose formula when it is not blank', () => {
    expect(trayPartCountOf(trayOfPieces(2))).toBe(2);
    expect(trayPartCountOf({ ...trayOfPieces(2), loose: '1d20' })).toBe(3);
    expect(trayPartCountOf({ ...trayOfPieces(2), loose: '   ' })).toBe(2);
  });

  it('there is room up to 10 parts', () => {
    expect(canAddTrayParts(trayOfPieces(9), 1)).toBe(true);
    expect(canAddTrayParts(trayOfPieces(9), 2)).toBe(false);
    expect(canAddTrayParts(trayOfPieces(10), 1)).toBe(false);
  });
});

describe('the tray with pieces', () => {
  it('advantage acts on the first d20: loose +5 then piece 1d20 → the piece is 2d20kh1', () => {
    const tray = addPiece(
      setLoose(EMPTY_TRAY, '+5'),
      { label: 'Acerto', expression: '1d20' },
      sequentialIds(),
    );
    expect(toRollParts(tray, 'advantage')).toEqual([
      { label: null, expression: '+5' },
      { label: 'Acerto', expression: '2d20kh1' },
    ]);
    expect(trayAdvantageBlockOf(tray)).toBeNull();
  });

  it('without a die anywhere advantage is blocked by no-dice and chooseMode puts 1d20 in the loose formula', () => {
    const tray = addPiece(EMPTY_TRAY, { label: 'Bônus', expression: '+3' }, sequentialIds());
    expect(trayAdvantageBlockOf(tray)).toBe('no-dice');
    const chosen = chooseMode({ ...EMPTY_TRAY_CHOICE, tray }, 'advantage');
    expect(chosen.tray.loose).toBe('1d20');
    expect(chosen.tray.pieces).toEqual(tray.pieces);
  });

  it('11 parts is the notation problem of parseDiceParts and does not roll', () => {
    const tray = { ...trayOfPieces(10), loose: '1d20' };
    expect(trayProblemOf(tray)?.message).toContain('Dice roll has 11 parts');
    expect(isTrayRollable(tray)).toBe(false);
  });

  it('clearTray empties the loose formula and the pieces', () => {
    const tray = { ...trayOfPieces(2), loose: '1d20' };
    expect(clearTray({ ...EMPTY_TRAY_CHOICE, tray }).tray).toEqual(EMPTY_TRAY);
  });

  it('a tray with only pieces is not empty, and the die buttons still count only the loose formula', () => {
    const tray = addPiece(EMPTY_TRAY, { label: 'Acerto', expression: '1d20' }, sequentialIds());
    expect(isTrayEmpty(tray)).toBe(false);
    expect(trayDieCountsOf(tray).size).toBe(0);
  });
});
