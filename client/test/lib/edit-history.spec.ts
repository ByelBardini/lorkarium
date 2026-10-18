import { describe, expect, it } from 'vitest';
import {
  EMPTY_HISTORY,
  HISTORY_LIMIT,
  afterRedo,
  afterUndo,
  inverseOf,
  record,
  remapEntry,
  type EditEntry,
} from '@/lib/edit-history';

const LYRA_MOVED: EditEntry = [
  {
    kind: 'tokensMoved',
    moves: [{ tokenId: 'lyra', from: { col: 4, row: 4 }, to: { col: 6, row: 4 } }],
  },
];

function moveNumber(index: number): EditEntry {
  return [
    {
      kind: 'tokensMoved',
      moves: [{ tokenId: 'lyra', from: { col: index, row: 0 }, to: { col: index + 1, row: 0 } }],
    },
  ];
}

describe('record', () => {
  it('a new action goes on top of the undo stack', () => {
    expect(record(EMPTY_HISTORY, LYRA_MOVED)).toEqual({ past: [LYRA_MOVED], future: [] });
  });

  it(`the ${HISTORY_LIMIT + 1}st action drops the oldest`, () => {
    const full = Array.from({ length: HISTORY_LIMIT + 1 }, (_, index) => moveNumber(index)).reduce(
      record,
      EMPTY_HISTORY,
    );

    expect(full.past).toHaveLength(HISTORY_LIMIT);
    expect(full.past[0]).toEqual(moveNumber(1));
  });

  it('a new action after an undo clears what could be redone', () => {
    const undone = afterUndo(record(EMPTY_HISTORY, LYRA_MOVED), {});

    expect(record(undone, moveNumber(9))).toEqual({ past: [moveNumber(9)], future: [] });
  });
});

describe('inverseOf', () => {
  it('a move is undone by the move back, from where it went to where it was', () => {
    expect(inverseOf(LYRA_MOVED)).toEqual([
      {
        kind: 'tokensMoved',
        moves: [{ tokenId: 'lyra', from: { col: 6, row: 4 }, to: { col: 4, row: 4 } }],
      },
    ]);
  });

  it('a paste of a token and a drawing is undone by removing both, last op first', () => {
    const token = { id: 'goblin', token: { name: 'Goblin' } };
    const drawing = { id: 'square', shape: { kind: 'rectangle' } };
    const paste = [
      { kind: 'tokensAdded', tokens: [token] },
      { kind: 'drawingsAdded', drawings: [drawing] },
    ] as unknown as EditEntry;

    expect(inverseOf(paste)).toEqual([
      { kind: 'drawingsRemoved', drawings: [drawing] },
      { kind: 'tokensRemoved', tokens: [token] },
    ]);
  });

  it('a turn is undone by the turn back, from where it looks to where it looked', () => {
    const turned: EditEntry = [
      { kind: 'tokensFaced', turns: [{ tokenId: 'kael', from: 0, to: 45 }] },
    ];

    expect(inverseOf(turned)).toEqual([
      { kind: 'tokensFaced', turns: [{ tokenId: 'kael', from: 45, to: 0 }] },
    ]);
  });

  it('a resize is undone by the resize back, from the new box to the old one', () => {
    const small = { col: 3, row: 3, width: 1, height: 1 };
    const big = { col: 2, row: 3, width: 2, height: 1 };
    const resized: EditEntry = [
      { kind: 'tokensResized', resizes: [{ tokenId: 'kael', from: small, to: big }] },
    ];

    expect(inverseOf(resized)).toEqual([
      { kind: 'tokensResized', resizes: [{ tokenId: 'kael', from: big, to: small }] },
    ]);
    expect(remapEntry(resized, { kael: 'new' })).toEqual([
      { kind: 'tokensResized', resizes: [{ tokenId: 'new', from: small, to: big }] },
    ]);
  });

  it('a turn of a token created again takes its new id', () => {
    const turned: EditEntry = [
      { kind: 'tokensFaced', turns: [{ tokenId: 'old', from: 0, to: 90 }] },
    ];

    expect(remapEntry(turned, { old: 'new' })).toEqual([
      { kind: 'tokensFaced', turns: [{ tokenId: 'new', from: 0, to: 90 }] },
    ]);
  });

  it('a deleted drawing is undone by adding it back', () => {
    const drawing = { id: 'square', shape: { kind: 'rectangle' } };
    const deleted = [{ kind: 'drawingsRemoved', drawings: [drawing] }] as unknown as EditEntry;

    expect(inverseOf(deleted)).toEqual([{ kind: 'drawingsAdded', drawings: [drawing] }]);
  });
});

describe('inverseOf, areas of effect', () => {
  const cone = { kind: 'diagonal_cone', x: 6, y: 6, reach: 3, facing: 45, color: 'ember' } as const;
  const grown = { ...cone, reach: 4 };

  it('a created area is undone by removing it with the shape it was created with', () => {
    const created: EditEntry = [
      { kind: 'effectAreasAdded', effectAreas: [{ id: 'a', shape: cone }] },
    ];
    expect(inverseOf(created)).toEqual([
      { kind: 'effectAreasRemoved', effectAreas: [{ id: 'a', shape: cone }] },
    ]);
  });

  it('a removed area is undone by creating it again', () => {
    const removed: EditEntry = [
      { kind: 'effectAreasRemoved', effectAreas: [{ id: 'a', shape: cone }] },
    ];
    expect(inverseOf(removed)).toEqual([
      { kind: 'effectAreasAdded', effectAreas: [{ id: 'a', shape: cone }] },
    ]);
  });

  it('a reshape is undone by the reshape back, from the new shape to the old one', () => {
    const reshaped: EditEntry = [
      { kind: 'effectAreasReshaped', reshapes: [{ effectAreaId: 'a', from: cone, to: grown }] },
    ];
    expect(inverseOf(reshaped)).toEqual([
      { kind: 'effectAreasReshaped', reshapes: [{ effectAreaId: 'a', from: grown, to: cone }] },
    ]);
  });

  it('an area created again takes its new id in the reshapes and removals after it', () => {
    const later: EditEntry = [
      { kind: 'effectAreasReshaped', reshapes: [{ effectAreaId: 'a', from: cone, to: grown }] },
      { kind: 'effectAreasRemoved', effectAreas: [{ id: 'a', shape: grown }] },
    ];
    expect(remapEntry(later, { a: 'b' })).toEqual([
      { kind: 'effectAreasReshaped', reshapes: [{ effectAreaId: 'b', from: cone, to: grown }] },
      { kind: 'effectAreasRemoved', effectAreas: [{ id: 'b', shape: grown }] },
    ]);
  });
});

describe('afterUndo and afterRedo', () => {
  it('an undone action moves to the redo stack, and redoing it moves it back', () => {
    const undone = afterUndo(record(EMPTY_HISTORY, LYRA_MOVED), {});
    expect(undone).toEqual({ past: [], future: [LYRA_MOVED] });

    expect(afterRedo(undone, {})).toEqual({ past: [LYRA_MOVED], future: [] });
  });

  it('ids created again replace the old ones in every entry left in both stacks', () => {
    const removed = [
      { kind: 'drawingsRemoved', drawings: [{ id: 'old', shape: {} }] },
    ] as unknown as EditEntry;
    const movedLater = [
      {
        kind: 'drawingsMoved',
        moves: [{ drawingId: 'old', from: { x: 1, y: 1 }, to: { x: 2, y: 2 } }],
      },
    ] as unknown as EditEntry;
    const history = record(record(EMPTY_HISTORY, removed), movedLater);
    const movedUndone = afterUndo(history, {});

    const deletionUndone = afterUndo(movedUndone, { old: 'new' });

    expect(deletionUndone.future).toEqual([
      [{ kind: 'drawingsRemoved', drawings: [{ id: 'new', shape: {} }] }],
      [
        {
          kind: 'drawingsMoved',
          moves: [{ drawingId: 'new', from: { x: 1, y: 1 }, to: { x: 2, y: 2 } }],
        },
      ],
    ]);
  });

  it('undo and redo with an empty stack change nothing', () => {
    expect(afterUndo(EMPTY_HISTORY, {})).toEqual(EMPTY_HISTORY);
    expect(afterRedo(EMPTY_HISTORY, {})).toEqual(EMPTY_HISTORY);
  });
});

describe('remapEntry', () => {
  it('token moves and pasted tokens take the new ids, the rest stays', () => {
    const entry = [
      {
        kind: 'tokensMoved',
        moves: [{ tokenId: 'a', from: { col: 0, row: 0 }, to: { col: 1, row: 0 } }],
      },
      { kind: 'tokensAdded', tokens: [{ id: 'b', token: {} }] },
    ] as unknown as EditEntry;

    expect(remapEntry(entry, { a: 'A', b: 'B' })).toEqual([
      {
        kind: 'tokensMoved',
        moves: [{ tokenId: 'A', from: { col: 0, row: 0 }, to: { col: 1, row: 0 } }],
      },
      { kind: 'tokensAdded', tokens: [{ id: 'B', token: {} }] },
    ]);
  });
});
