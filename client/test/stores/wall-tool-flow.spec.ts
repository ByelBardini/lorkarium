import { beforeEach, describe, expect, it } from 'vitest';
import type { EditEntry } from '@/lib/edit-history';
import { sendWall } from '@/stores/wall-tool-flow';
import { VHARN } from '../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../support/table-board-commands-fake';
import { northWall } from '../support/wall-fixtures';

const NEW_WALL_ID = 'f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c';
const SCENE = { widthCells: 20, heightCells: 12 };
const STRAIGHT = { kind: 'wall', shape: 'line' } as const;
const DRAG = {
  points: [
    { x: 6.1, y: 2 },
    { x: 6, y: 8 },
  ],
  snap: false,
};

describe('sendWall', () => {
  let commands: TableBoardCommandsFake;
  let recorded: EditEntry[];
  let notices: string[];

  beforeEach(() => {
    commands = new TableBoardCommandsFake();
    recorded = [];
    notices = [];
  });

  function send(readOnly = false) {
    return sendWall(
      {
        campaignId: VHARN.id,
        commands,
        describeRefusal: (failure) => `refused: ${failure}`,
        recordEdit: (entry) => recorded.push(entry),
      },
      DRAG,
      {
        style: STRAIGHT,
        walls: [northWall()],
        scene: SCENE,
        readOnly,
        say: (notice) => notices.push(notice),
      },
    );
  }

  it('the drag becomes one createWalls, glued to the end of the north wall', async () => {
    await send();

    expect(commands.sentAs('createWalls').map(({ fields }) => fields)).toEqual([
      {
        walls: [
          {
            kind: 'wall',
            shape: 'line',
            x: 6,
            y: 2,
            width: 0,
            height: 6,
            points: [
              [0, 0],
              [0, 6],
            ],
          },
        ],
      },
    ]);
  });

  it('confirmed, it goes on the undo stack with the id the server gave', async () => {
    commands.answerWith({ ok: true, version: 5, createdIds: [NEW_WALL_ID] });

    await send();

    const [shape] = (commands.sentAs('createWalls')[0]?.fields as { walls: unknown[] }).walls;
    expect(recorded).toEqual([[{ kind: 'wallsAdded', walls: [{ id: NEW_WALL_ID, shape }] }]]);
  });

  it('refused, the status line says why and nothing is recorded', async () => {
    commands.answerWith({ ok: false, failure: 'wall_limit' });

    await send();

    expect(notices).toEqual(['refused: wall_limit']);
    expect(recorded).toEqual([]);
  });

  it('read only, nothing is sent', async () => {
    await send(true);

    expect(commands.sent).toEqual([]);
  });
});
