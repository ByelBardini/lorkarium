import { cell } from '@lorkarium/game-core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { EditEntry } from '@/lib/edit-history';
import { createSpawnAimStore, sendSpawn } from '@/stores/spawn-aim-flow';
import { zombieSaved } from '../support/saved-token-fixtures';
import { TableBoardCommandsFake } from '../support/table-board-commands-fake';
import { VHARN_GRID } from '../support/table-session-fixtures';

const SPAWNED_ID = '6f8a0c24-5e7b-4c9d-8f3a-4b6c8d0e2f5a';

function uuidCounter(): () => string {
  let next = 0;
  return () => `00000000-0000-4000-8000-${String((next += 1)).padStart(12, '0')}`;
}

describe('sendSpawn', () => {
  let commands: TableBoardCommandsFake;
  let recorded: EditEntry[];
  let notices: string[];

  beforeEach(() => {
    commands = new TableBoardCommandsFake();
    recorded = [];
    notices = [];
  });

  function spawn(readOnly = false) {
    return sendSpawn(
      {
        scopeOf: () => VHARN_GRID,
        commands,
        describeRefusal: (failure) => `refused: ${failure}`,
        recordEdit: (entry) => recorded.push(entry),
        newId: uuidCounter(),
      },
      zombieSaved(),
      cell(4, 7),
      { readOnly, say: (notice) => notices.push(notice) },
    );
  }

  it('one click sends one createTokens with the saved zombie on the cell, without controllers', async () => {
    await spawn();

    const [sent] = commands.sentAs('createTokens');
    expect(sent).toMatchObject(VHARN_GRID);
    expect(sent?.fields).toMatchObject({
      tokens: [{ name: 'Zumbi', col: 4, row: 7, controllerIds: [], side: 'enemy' }],
    });
  });

  it('confirmed, the zombie goes on the undo stack by the id the server gave', async () => {
    commands.answerWith({ ok: true, version: 2, createdIds: [SPAWNED_ID] });

    await spawn();

    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.[0]).toMatchObject({
      kind: 'tokensAdded',
      tokens: [{ id: SPAWNED_ID, token: { name: 'Zumbi', col: 4, row: 7 } }],
    });
  });

  it('refused, the status line says why and nothing goes on the undo stack', async () => {
    commands.answerWith({ ok: false, failure: 'token_limit' });

    await spawn();

    expect(notices).toEqual(['refused: token_limit']);
    expect(recorded).toEqual([]);
  });

  it('read only sends nothing', async () => {
    await spawn(true);

    expect(commands.sent).toEqual([]);
  });
});

describe('createSpawnAimStore', () => {
  it('arming keeps the saved token and its ghost; disarming clears both', () => {
    const aim = createSpawnAimStore();

    aim.getState().arm(zombieSaved());
    const armed = aim.getState();
    aim.getState().disarm();

    expect(armed.armed?.name).toBe('Zumbi');
    expect(armed.ghost?.token).toMatchObject({ initials: 'ZB', width: 1, height: 1 });
    expect(aim.getState()).toMatchObject({ armed: null, ghost: null });
  });

  it('arming the one already armed disarms it (the entry toggles)', () => {
    const aim = createSpawnAimStore();

    aim.getState().arm(zombieSaved());
    aim.getState().arm(zombieSaved());

    expect(aim.getState().armed).toBeNull();
  });
});
