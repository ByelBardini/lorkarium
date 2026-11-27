import { cell } from '@lorkarium/game-core';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useRoomSpawn } from '@/features/saved-tokens/use-room-spawn';
import { createBoardInteractionStore } from '@/stores/board-interaction-store';
import { createCopyArea, createTableEditStore } from '@/stores/table-edit-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { ZOMBIE_ID, zombieSaved } from '../../support/saved-token-fixtures';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import { SavedTokensApiFake } from '../../support/saved-tokens-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import { VHARN_GRID } from '../../support/table-session-fixtures';

const SPAWNED_ID = '6f8a0c24-5e7b-4c9d-8f3a-4b6c8d0e2f5a';

function setup() {
  const commands = new TableBoardCommandsFake();
  const interaction = createBoardInteractionStore({
    scopeOf: () => VHARN_GRID,
    commands,
    describeRefusal: String,
  });
  const edits = createTableEditStore(VHARN.id, createCopyArea());
  const api = new SavedTokensApiFake([zombieSaved()]);
  const deps = {
    campaignId: VHARN.id,
    api,
    commands,
    interaction,
    edits,
    scopeOf: () => VHARN_GRID,
    sceneOf: () => ({ widthCells: 20, heightCells: 12 }),
  };
  const { result } = renderHook(() => useRoomSpawn(deps));
  return { api, commands, edits, interaction, result };
}

async function flushed(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('useRoomSpawn', () => {
  it('with the zombie armed, a press on (4, 7) sends it there and the undo stack keeps it', async () => {
    const { commands, edits, result } = setup();
    commands.answerWith({ ok: true, version: 2, createdIds: [SPAWNED_ID] });

    act(() => result.current.aim.getState().arm(zombieSaved()));
    act(() => result.current.spawnAt(cell(4, 7)));
    await flushed();

    expect(commands.sentAs('createTokens')[0]?.fields).toMatchObject({
      tokens: [{ name: 'Zumbi', col: 4, row: 7 }],
    });
    expect(edits.getState().history.past).toHaveLength(1);
  });

  it('it stays armed: a second press spawns a second zombie', async () => {
    const { commands, result } = setup();

    act(() => result.current.aim.getState().arm(zombieSaved()));
    act(() => result.current.spawnAt(cell(4, 7)));
    act(() => result.current.spawnAt(cell(6, 7)));
    await flushed();

    expect(commands.sentAs('createTokens')).toHaveLength(2);
  });

  it('the Zumbi dropped from the panel at world (5.4, 3.2) cells spawns on (5, 3)', async () => {
    const { commands, result } = setup();
    act(() => result.current.list.getState().load());
    await flushed();

    act(() =>
      result.current.dropAt(ZOMBIE_ID, { x: 5.4 * CELL_WORLD_SIZE, y: 3.2 * CELL_WORLD_SIZE }),
    );
    await flushed();

    expect(commands.sentAs('createTokens')[0]?.fields).toMatchObject({
      tokens: [{ name: 'Zumbi', col: 5, row: 3 }],
    });
  });

  it('a drop off the scene or of an unknown saved token sends nothing', async () => {
    const { commands, result } = setup();
    act(() => result.current.list.getState().load());
    await flushed();

    act(() => result.current.dropAt(ZOMBIE_ID, { x: -10, y: 5 }));
    act(() => result.current.dropAt('00000000-0000-4000-8000-00000000dead', { x: 64, y: 64 }));

    expect(commands.sent).toEqual([]);
  });

  it('without anything armed a press sends nothing', () => {
    const { commands, result } = setup();

    act(() => result.current.spawnAt(cell(4, 7)));

    expect(commands.sent).toEqual([]);
  });

  it('Esc disarms the aim', () => {
    const { result } = setup();
    act(() => result.current.aim.getState().arm(zombieSaved()));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(result.current.aim.getState().armed).toBeNull();
  });

  it('a refusal reaches the status line of the board', async () => {
    const { commands, interaction, result } = setup();
    commands.answerWith({ ok: false, failure: 'forbidden' });

    act(() => result.current.aim.getState().arm(zombieSaved()));
    act(() => result.current.spawnAt(cell(4, 7)));
    await flushed();

    expect(interaction.getState().notice).toBe('Esse token não é seu.');
  });
});
