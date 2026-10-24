import { beforeEach, describe, expect, it } from 'vitest';
import type { EditEntry } from '@/lib/edit-history';
import { DEFAULT_DRAWING_STYLE, type DrawingStyle } from '@/lib/drawing-style';
import { sendSketch, type SketchContext } from '@/stores/drawing-tool-flow';
import { SQUARE_ID } from '../support/drawing-fixtures';
import { TableBoardCommandsFake } from '../support/table-board-commands-fake';
import { VHARN_GRID } from '../support/table-session-fixtures';

const ELLIPSE: DrawingStyle = {
  kind: 'ellipse',
  stroke: 'violet',
  fill: 'moss',
  strokeWidth: 'thick',
};

describe('sendSketch', () => {
  let commands: TableBoardCommandsFake;
  let recorded: EditEntry[];
  let notices: string[];

  beforeEach(() => {
    commands = new TableBoardCommandsFake();
    commands.answerWith({ ok: true, version: 5, createdIds: [SQUARE_ID] });
    recorded = [];
    notices = [];
  });

  function deps() {
    return {
      scopeOf: () => VHARN_GRID,
      commands,
      describeRefusal: (failure: string) => `recusado: ${failure}`,
      recordEdit: (entry: EditEntry) => recorded.push(entry),
    };
  }

  function context(overrides: Partial<SketchContext> = {}): SketchContext {
    return {
      style: ELLIPSE,
      readOnly: false,
      say: (notice) => notices.push(notice),
      ...overrides,
    };
  }

  const DRAGGED = {
    points: [
      { x: 1, y: 1 },
      { x: 4, y: 3 },
    ],
    snap: false,
  };

  it('an ellipse dragged from (1, 1) to (4, 3) is one createDrawings with its box and the style', async () => {
    await sendSketch(deps(), DRAGGED, context());

    expect(commands.sentAs('createDrawings')).toEqual([
      {
        name: 'createDrawings',
        ...VHARN_GRID,
        fields: {
          drawings: [
            {
              kind: 'ellipse',
              x: 1,
              y: 1,
              width: 3,
              height: 2,
              fill: 'moss',
              stroke: 'violet',
              strokeWidth: 'thick',
            },
          ],
        },
      },
    ]);
  });

  it('the confirmed drawing goes on the undo stack with the id the server gave', async () => {
    await sendSketch(deps(), DRAGGED, context());

    expect(recorded).toEqual([
      [
        {
          kind: 'drawingsAdded',
          drawings: [{ id: SQUARE_ID, shape: expect.objectContaining({ kind: 'ellipse', x: 1 }) }],
        },
      ],
    ]);
  });

  it('a freehand line sends the simplified points and never a fill', async () => {
    const line = Array.from({ length: 200 }, (_, index) => ({ x: 1 + index / 100, y: 2 }));
    const freehand = { ...DEFAULT_DRAWING_STYLE, fill: 'ember' } as const;

    await sendSketch(deps(), { points: line, snap: false }, context({ style: freehand }));

    const [sent] = commands.sentAs('createDrawings');
    expect(sent?.fields).toEqual({
      drawings: [
        {
          kind: 'freehand',
          x: 1,
          y: 2,
          width: 1.99,
          height: 0,
          points: [
            [0, 0],
            [1.99, 0],
          ],
          stroke: 'gold',
          strokeWidth: 'medium',
        },
      ],
    });
  });

  it('the drawing goes with no layer: drawings live on their own', async () => {
    await sendSketch(deps(), DRAGGED, context());

    expect(commands.sentAs('createDrawings')[0]?.fields).toMatchObject({
      drawings: [expect.not.objectContaining({ layer: expect.anything() })],
    });
  });

  it('a refusal says why on the status line and records nothing', async () => {
    commands.answerWith({ ok: false, failure: 'drawing_limit' });

    await sendSketch(deps(), DRAGGED, context());

    expect(notices).toEqual(['recusado: drawing_limit']);
    expect(recorded).toEqual([]);
  });

  it('while reconnecting nothing is sent', async () => {
    await sendSketch(deps(), DRAGGED, context({ readOnly: true }));

    expect(commands.sent).toEqual([]);
  });

  it('a press with no move sends nothing', async () => {
    await sendSketch(deps(), { points: [{ x: 2, y: 2 }], snap: false }, context());

    expect(commands.sent).toEqual([]);
  });
});
