import { cell } from '@lorkarium/game-core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import {
  createTokenPatrolEditor,
  patrolDraftCanRestart,
  patrolDraftMoves,
  type TokenPatrolEditor,
} from '@/stores/token-patrol-flow';
import { squarePatrol } from '../support/patrol-fixtures';
import { TableBoardCommandsFake } from '../support/table-board-commands-fake';
import { KAEL_ID, VHARN_GRID, kael } from '../support/table-session-fixtures';

const FULL = 'Até 32 pontos.';

describe('the patrol editor', () => {
  let commands: TableBoardCommandsFake;
  let editor: StoreApi<TokenPatrolEditor>;
  let said: string[];

  beforeEach(() => {
    commands = new TableBoardCommandsFake();
    editor = createTokenPatrolEditor({ commands, fullNotice: FULL });
    said = [];
  });

  function openKael(token = kael({ col: 4, row: 4 })): void {
    editor.getState().open({ scope: VHARN_GRID, token, say: (notice) => said.push(notice) });
  }

  const pathNow = () => editor.getState().draft?.path;

  it('opened on Kael at (4, 4) the route starts on his cell, circuit, 1 cell/s, turning', () => {
    openKael();

    expect(editor.getState().draft).toMatchObject({
      tokenId: KAEL_ID,
      tokenName: 'Kael',
      path: [cell(4, 4)],
      repeat: 'loop',
      speed: 1,
      turns: true,
      saved: false,
    });
  });

  const SQUARE = [cell(0, 0), cell(2, 0), cell(2, 2), cell(0, 2)];

  it('opened on a token with a saved patrol loads its route and its form', () => {
    const patrol = squarePatrol({ repeat: 'bounce', speed: 2, turns: false });

    openKael(kael({ col: 4, row: 4, patrol }));

    expect(editor.getState().draft).toMatchObject({
      path: SQUARE,
      repeat: 'bounce',
      speed: 2,
      turns: false,
      saved: true,
    });
  });

  it('a saved route can be saved again with only the speed changed', async () => {
    openKael(kael({ col: 4, row: 4, patrol: squarePatrol() }));
    editor.getState().setSpeed(2);

    await editor.getState().save();

    expect(commands.sent).toEqual([
      {
        name: 'setTokenPatrol',
        ...VHARN_GRID,
        fields: {
          tokenId: KAEL_ID,
          patrol: { path: SQUARE, repeat: 'loop', speed: 2, turns: true },
        },
      },
    ]);
  });

  it('a click on the map extends the saved route instead of replacing it', () => {
    openKael(kael({ col: 4, row: 4, patrol: squarePatrol() }));

    editor.getState().addPoint(cell(5, 5));

    expect(pathNow()).toEqual([...SQUARE, cell(5, 5)]);
  });

  it('restart throws the loaded route away and starts again on the token cell', () => {
    openKael(kael({ col: 4, row: 4, patrol: squarePatrol() }));

    editor.getState().restart();

    expect(pathNow()).toEqual([cell(4, 4)]);
    expect(patrolDraftCanRestart(editor.getState().draft!)).toBe(false);
  });

  it('there is something to restart once the route is more than the token cell', () => {
    openKael(kael({ col: 4, row: 4 }));
    expect(patrolDraftCanRestart(editor.getState().draft!)).toBe(false);

    editor.getState().addPoint(cell(8, 4));

    expect(patrolDraftCanRestart(editor.getState().draft!)).toBe(true);
  });

  it('each click adds a point: (8, 4) and (8, 8) make three', () => {
    openKael();

    editor.getState().addPoint(cell(8, 4));
    editor.getState().addPoint(cell(8, 8));

    expect(pathNow()).toEqual([cell(4, 4), cell(8, 4), cell(8, 8)]);
  });

  it('a click on the last point again adds nothing', () => {
    openKael();
    editor.getState().addPoint(cell(8, 4));

    editor.getState().addPoint(cell(8, 4));

    expect(pathNow()).toHaveLength(2);
  });

  it('Backspace takes the last point off, but never the first', () => {
    openKael();
    editor.getState().addPoint(cell(8, 4));

    editor.getState().removeLastPoint();
    editor.getState().removeLastPoint();

    expect(pathNow()).toEqual([cell(4, 4)]);
  });

  it('the 33rd point does not go in and the status line says "Até 32 pontos."', () => {
    openKael();
    for (let index = 1; index < 32; index += 1) editor.getState().addPoint(cell(index % 20, 0));

    editor.getState().addPoint(cell(19, 11));

    expect(pathNow()).toHaveLength(32);
    expect(said).toEqual([FULL]);
  });

  it('save sends the route with the form and closes the editor on the ok', async () => {
    openKael();
    editor.getState().addPoint(cell(8, 4));
    editor.getState().addPoint(cell(8, 8));

    await editor.getState().save();

    expect(commands.sent).toEqual([
      {
        name: 'setTokenPatrol',
        ...VHARN_GRID,
        fields: {
          tokenId: KAEL_ID,
          patrol: {
            path: [cell(4, 4), cell(8, 4), cell(8, 8)],
            repeat: 'loop',
            speed: 1,
            turns: true,
          },
        },
      },
    ]);
    expect(editor.getState().draft).toBeNull();
  });

  it('save with a single point sends nothing', async () => {
    openKael();

    await editor.getState().save();

    expect(commands.sent).toEqual([]);
  });

  it('a route back to the token cell alone is not saved', async () => {
    openKael();
    editor.getState().addPoint(cell(8, 4));
    editor.getState().removeLastPoint();

    await editor.getState().save();

    expect(commands.sent).toEqual([]);
  });

  it('patrolDraftMoves is false while every point is the token cell and true once one leaves it', () => {
    expect(patrolDraftMoves({ path: [cell(4, 4)] })).toBe(false);
    expect(patrolDraftMoves({ path: [cell(4, 4), cell(8, 4), cell(4, 4)] })).toBe(true);
  });

  it('a refused save (out of scene) keeps the editor open with the failure', async () => {
    openKael();
    editor.getState().addPoint(cell(8, 4));
    commands.answerWith({ ok: false, failure: 'out_of_scene' });

    await editor.getState().save();

    expect(editor.getState()).toMatchObject({ failure: 'out_of_scene', busy: false });
    expect(pathNow()).toHaveLength(2);
  });

  it('the repeat, the speed and the turn change the draft', () => {
    openKael();

    editor.getState().setRepeat('bounce');
    editor.getState().setSpeed(2.5);
    editor.getState().setTurns(false);

    expect(editor.getState().draft).toMatchObject({ repeat: 'bounce', speed: 2.5, turns: false });
  });

  it('remove takes the saved patrol away (patrol null) and closes', async () => {
    openKael(kael({ col: 4, row: 4, patrol: squarePatrol() }));

    await editor.getState().remove();

    expect(commands.sent[0]).toMatchObject({
      name: 'setTokenPatrol',
      fields: { tokenId: KAEL_ID, patrol: null },
    });
    expect(editor.getState().draft).toBeNull();
  });

  it('cancel (Esc) closes the editor and sends nothing', () => {
    openKael();
    editor.getState().addPoint(cell(8, 4));

    editor.getState().cancel();

    expect(editor.getState().draft).toBeNull();
    expect(commands.sent).toEqual([]);
  });

  it('a point with the editor closed is ignored', () => {
    editor.getState().addPoint(cell(8, 4));

    expect(editor.getState().draft).toBeNull();
  });
});
