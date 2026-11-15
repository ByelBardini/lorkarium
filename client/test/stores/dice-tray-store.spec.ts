import { describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { EMPTY_TRAY_CHOICE, setLoose, toRollParts } from '@/lib/dice-tray';
import { diceTrayStoreOf, type TableOpenings } from '@/stores/dice-tray-store';
import { ACERTO, BENCAO } from '../support/dice-fixtures';

const VHARN = 'c0ffee00-0000-4000-8000-000000000001';
const QUELM = 'c0ffee00-0000-4000-8000-000000000002';

type OpenTablesState = { tables: readonly { campaignId: string }[] };

function openTablesWith(...campaignIds: string[]) {
  return createStore<OpenTablesState>(() => ({
    tables: campaignIds.map((campaignId) => ({ campaignId })),
  }));
}

function sequentialIds(): () => string {
  let next = 0;
  return () => `p${(next += 1)}`;
}

describe('diceTrayStoreOf', () => {
  it('the same table gives the same store: what the sheet adds, the panel sees', () => {
    const openTables: TableOpenings = openTablesWith(VHARN);
    const fromSheet = diceTrayStoreOf(openTables, VHARN, sequentialIds());
    fromSheet.getState().addPiece({ label: 'Bênção', expression: '1d4+5' });
    const fromPanel = diceTrayStoreOf(openTables, VHARN);
    expect(fromPanel).toBe(fromSheet);
    expect(fromPanel.getState().choice.tray.pieces).toEqual([
      { id: 'p1', label: 'Bênção', expression: '1d4+5' },
    ]);
  });

  it('another table has its own empty tray', () => {
    const openTables = openTablesWith(VHARN, QUELM);
    diceTrayStoreOf(openTables, VHARN).getState().addSavedRoll(ACERTO);
    expect(diceTrayStoreOf(openTables, QUELM).getState().choice).toEqual(EMPTY_TRAY_CHOICE);
  });

  it('another open-tables store (another test, another tab) starts empty', () => {
    diceTrayStoreOf(openTablesWith(VHARN), VHARN).getState().addSavedRoll(ACERTO);
    expect(diceTrayStoreOf(openTablesWith(VHARN), VHARN).getState().choice).toEqual(
      EMPTY_TRAY_CHOICE,
    );
  });

  it('closing the table empties its tray and forgets it', () => {
    const openTables = openTablesWith(VHARN, QUELM);
    const tray = diceTrayStoreOf(openTables, VHARN);
    tray.getState().addSavedRoll(ACERTO);
    diceTrayStoreOf(openTables, QUELM).getState().addSavedRoll(BENCAO);
    openTables.setState({ tables: [{ campaignId: QUELM }] });
    expect(tray.getState().choice).toEqual(EMPTY_TRAY_CHOICE);
    expect(diceTrayStoreOf(openTables, VHARN)).not.toBe(tray);
    expect(diceTrayStoreOf(openTables, QUELM).getState().choice.tray.pieces).toHaveLength(1);
  });
});

describe('the tray store’s commands', () => {
  const trayOf = () => diceTrayStoreOf(openTablesWith(VHARN), VHARN, sequentialIds());

  it('addSavedRoll and removePiece go through the tray’s math', () => {
    const tray = trayOf();
    expect(tray.getState().addSavedRoll(ACERTO)).toBe(true);
    tray.getState().addSavedRoll(BENCAO);
    tray.getState().removePiece('p1');
    expect(toRollParts(tray.getState().choice.tray, 'normal')).toEqual([
      { label: 'Bênção', expression: '1d4' },
    ]);
  });

  it('a full tray refuses the piece and answers false', () => {
    const tray = trayOf();
    for (let index = 0; index < 10; index += 1) tray.getState().addSavedRoll(BENCAO);
    expect(tray.getState().addPiece({ label: 'X', expression: '1d4' })).toBe(false);
    expect(tray.getState().choice.tray.pieces).toHaveLength(10);
  });

  it('an unreadable piece is the tray’s RangeError', () => {
    expect(() => trayOf().getState().addPiece({ label: 'X', expression: '2d' })).toThrow(
      RangeError,
    );
  });

  it('chooseMode on a tray without dice puts the d20, and clear goes back to Normal keeping "Quem vê"', () => {
    const tray = trayOf();
    tray.getState().setChoice({ ...EMPTY_TRAY_CHOICE, secret: true });
    tray.getState().chooseMode('advantage');
    expect(tray.getState().choice.tray.loose).toBe('1d20');
    tray.getState().clear();
    expect(tray.getState().choice).toEqual({ ...EMPTY_TRAY_CHOICE, secret: true });
  });

  it('removing the last die drops the mode (withTray)', () => {
    const tray = trayOf();
    tray.getState().addSavedRoll(ACERTO);
    tray.getState().chooseMode('advantage');
    tray.getState().removePiece('p1');
    expect(tray.getState().choice.mode).toBe('normal');
  });

  it('partCount counts the pieces and the loose formula', () => {
    const tray = trayOf();
    tray.getState().addSavedRoll(ACERTO);
    expect(tray.getState().partCount()).toBe(1);
    tray.getState().setChoice({
      ...tray.getState().choice,
      tray: setLoose(tray.getState().choice.tray, '+2'),
    });
    expect(tray.getState().partCount()).toBe(2);
  });
});
