import { describe, expect, it } from 'vitest';
import {
  EMPTY_HISTORY,
  HISTORY_LIMIT,
  afterRedo,
  afterUndo,
  inverseOf,
  isLightOp,
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

describe('inverseOf, walls', () => {
  const line = {
    kind: 'wall',
    shape: 'line',
    x: 2,
    y: 2,
    width: 4,
    height: 0,
    points: [
      [0, 0],
      [4, 0],
    ],
  } as const;
  const shape = {
    ...line,
    points: [
      [0, 0],
      [4, 0],
    ] as [number, number][],
  };

  it('a created wall is undone by removing it, and a removed one by creating it again', () => {
    const added: EditEntry = [{ kind: 'wallsAdded', walls: [{ id: 'w', shape }] }];

    expect(inverseOf(added)).toEqual([{ kind: 'wallsRemoved', walls: [{ id: 'w', shape }] }]);
    expect(inverseOf(inverseOf(added))).toEqual(added);
  });

  it('a change of kind is undone by the kind it had', () => {
    const changed: EditEntry = [
      { kind: 'wallsKindChanged', changes: [{ wallId: 'w', from: 'wall', to: 'door' }] },
    ];
    expect(inverseOf(changed)).toEqual([
      { kind: 'wallsKindChanged', changes: [{ wallId: 'w', from: 'door', to: 'wall' }] },
    ]);
  });

  it('a wall created again takes its new id in the kind changes and removals after it', () => {
    const later: EditEntry = [
      { kind: 'wallsKindChanged', changes: [{ wallId: 'w', from: 'wall', to: 'grate' }] },
      { kind: 'wallsRemoved', walls: [{ id: 'w', shape }] },
    ];
    expect(remapEntry(later, { w: 'v' })).toEqual([
      { kind: 'wallsKindChanged', changes: [{ wallId: 'v', from: 'wall', to: 'grate' }] },
      { kind: 'wallsRemoved', walls: [{ id: 'v', shape }] },
    ]);
  });
});

describe('inverseOf and remapEntry, lights', () => {
  const placement = { x: 5.5, y: 3, bright: 4, dim: 4, color: null, facing: 0, angle: 360 };

  it('a placed light is undone by removing it, and a removed one by placing it again', () => {
    const added: EditEntry = [{ kind: 'lightsAdded', lights: [{ id: 'l', placement }] }];

    expect(inverseOf(added)).toEqual([{ kind: 'lightsRemoved', lights: [{ id: 'l', placement }] }]);
    expect(inverseOf(inverseOf(added))).toEqual(added);
  });

  it('a move of a light is undone by the move back', () => {
    const moved: EditEntry = [
      { kind: 'lightsMoved', moves: [{ lightId: 'l', from: { x: 5, y: 5 }, to: { x: 7, y: 5 } }] },
    ];

    expect(inverseOf(moved)).toEqual([
      { kind: 'lightsMoved', moves: [{ lightId: 'l', from: { x: 7, y: 5 }, to: { x: 5, y: 5 } }] },
    ]);
  });

  it('a new reach is undone by the reach the light had', () => {
    const changed: EditEntry = [
      {
        kind: 'lightRangesChanged',
        changes: [{ lightId: 'l', from: { bright: 4, dim: 4 }, to: { bright: 6, dim: 0 } }],
      },
    ];

    expect(inverseOf(changed)).toEqual([
      {
        kind: 'lightRangesChanged',
        changes: [{ lightId: 'l', from: { bright: 6, dim: 0 }, to: { bright: 4, dim: 4 } }],
      },
    ]);
  });

  it('a light placed again takes its new id in the moves and reach changes after it', () => {
    const later: EditEntry = [
      { kind: 'lightsMoved', moves: [{ lightId: 'l', from: { x: 5, y: 5 }, to: { x: 7, y: 5 } }] },
      {
        kind: 'lightRangesChanged',
        changes: [{ lightId: 'l', from: { bright: 4, dim: 4 }, to: { bright: 6, dim: 0 } }],
      },
    ];

    expect(remapEntry(later, { l: 'm' }).map((op) => JSON.stringify(op).includes('"m"'))).toEqual([
      true,
      true,
    ]);
  });

  it('a color change is undone by swapping from and to', () => {
    const changed: EditEntry = [
      { kind: 'lightColorsChanged', changes: [{ lightId: 'l', from: null, to: 'moon' }] },
    ];

    expect(inverseOf(changed)).toEqual([
      { kind: 'lightColorsChanged', changes: [{ lightId: 'l', from: 'moon', to: null }] },
    ]);
  });

  it('a light placed again takes its new id in the color changes after it', () => {
    const later: EditEntry = [
      { kind: 'lightColorsChanged', changes: [{ lightId: 'l', from: null, to: 'moon' }] },
    ];

    expect(remapEntry(later, { l: 'm' })).toEqual([
      { kind: 'lightColorsChanged', changes: [{ lightId: 'm', from: null, to: 'moon' }] },
    ]);
  });

  it('a color change is a light op', () => {
    expect(isLightOp({ kind: 'lightColorsChanged', changes: [] })).toBe(true);
  });

  it('a light placed again takes its new id in the removals after it', () => {
    const later: EditEntry = [{ kind: 'lightsRemoved', lights: [{ id: 'l', placement }] }];

    expect(remapEntry(later, { l: 'm' })).toEqual([
      { kind: 'lightsRemoved', lights: [{ id: 'm', placement }] },
    ]);
  });
});

describe('inverseOf, a token move with a path', () => {
  it('the undo of a move around a wall walks the same bends backwards', () => {
    const moved: EditEntry = [
      {
        kind: 'tokensMoved',
        moves: [
          {
            tokenId: 'lyra',
            from: { col: 3, row: 4 },
            to: { col: 7, row: 4 },
            path: [
              { col: 3, row: 7 },
              { col: 7, row: 7 },
            ],
          },
        ],
      },
    ];

    expect(inverseOf(moved)).toEqual([
      {
        kind: 'tokensMoved',
        moves: [
          {
            tokenId: 'lyra',
            from: { col: 7, row: 4 },
            to: { col: 3, row: 4 },
            path: [
              { col: 7, row: 7 },
              { col: 3, row: 7 },
            ],
          },
        ],
      },
    ]);
  });
});

describe('the cone of a map light on the undo stack', () => {
  const changed: EditEntry = [
    {
      kind: 'lightConesChanged',
      changes: [{ lightId: 'l', from: { facing: 0, angle: 360 }, to: { facing: 90, angle: 60 } }],
    },
  ];

  it('a cone change is undone by swapping from and to', () => {
    expect(inverseOf(changed)).toEqual([
      {
        kind: 'lightConesChanged',
        changes: [{ lightId: 'l', from: { facing: 90, angle: 60 }, to: { facing: 0, angle: 360 } }],
      },
    ]);
  });

  it('a light placed again takes its new id in the cone changes after it', () => {
    const [op] = remapEntry(changed, { l: 'm' });

    expect(op?.kind === 'lightConesChanged' && op.changes[0]?.lightId).toBe('m');
  });

  it('a cone change is a light op', () => {
    expect(isLightOp({ kind: 'lightConesChanged', changes: [] })).toBe(true);
  });

  it('a removed spotlight is placed again with its facing and angle', () => {
    const spotlight = { x: 5, y: 5, bright: 4, dim: 4, color: null, facing: 90, angle: 60 };
    const removed: EditEntry = [
      { kind: 'lightsRemoved', lights: [{ id: 'l', placement: spotlight }] },
    ];

    expect(inverseOf(removed)).toEqual([
      { kind: 'lightsAdded', lights: [{ id: 'l', placement: spotlight }] },
    ]);
  });
});

describe('inverseOf and remapEntry, hidden tokens', () => {
  const HIDDEN: EditEntry = [{ kind: 'tokensHidden', tokenIds: ['lyra', 'kael'], hidden: true }];

  it('hiding tokens is undone by showing the same tokens', () => {
    expect(inverseOf(HIDDEN)).toEqual([
      { kind: 'tokensHidden', tokenIds: ['lyra', 'kael'], hidden: false },
    ]);
  });

  it('a token created again takes its new id in the hiding', () => {
    expect(remapEntry(HIDDEN, { lyra: 'lyra-2' })).toEqual([
      { kind: 'tokensHidden', tokenIds: ['lyra-2', 'kael'], hidden: true },
    ]);
  });
});

describe('inverseOf and remapEntry, token forms', () => {
  const SWITCHED: EditEntry = [
    { kind: 'tokenFormChanged', tokenId: 'lyra', from: 'base', to: 'wolf' },
  ];

  it('a form switch is undone by switching back, from the new form to the old one', () => {
    expect(inverseOf(SWITCHED)).toEqual([
      { kind: 'tokenFormChanged', tokenId: 'lyra', from: 'wolf', to: 'base' },
    ]);
  });

  it('a token created again takes its new id in the switch', () => {
    expect(remapEntry(SWITCHED, { lyra: 'lyra-2' })).toEqual([
      { kind: 'tokenFormChanged', tokenId: 'lyra-2', from: 'base', to: 'wolf' },
    ]);
  });
});
