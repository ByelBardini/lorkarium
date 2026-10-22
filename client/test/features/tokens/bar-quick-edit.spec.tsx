import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlayerCardHarness, cardBar } from '../../support/player-card-harness';
import { ANA_AT_TABLE, CAIO_AT_TABLE, LYRA_ID, lyra } from '../../support/table-session-fixtures';

const PV_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const pv = cardBar({ id: PV_ID });

describe('BarQuickEdit', () => {
  let harness: PlayerCardHarness;

  beforeEach(() => {
    harness = new PlayerCardHarness();
  });

  function renderAsBia(bar = pv): void {
    harness.render({ state: { tokens: [lyra({ bars: [bar] })] } });
  }

  const trigger = () => screen.getByRole('button', { name: 'Editar PV de Lyra' });
  const balloon = () => screen.queryByRole('dialog', { name: 'PV' });
  const current = () => within(balloon() ?? document.body).getByRole('textbox', { name: 'Atual' });
  const max = () => within(balloon() ?? document.body).getByRole('textbox', { name: 'Máx' });
  const sent = () => harness.commands.sentAs('adjustBar').map(({ fields }) => fields);

  async function retype(field: HTMLElement, text: string): Promise<void> {
    await userEvent.clear(field);
    await userEvent.type(field, text);
  }

  it('a double click on the PV of Lyra opens the balloon with "Atual" focused on 21, selected, and "Máx" 28', async () => {
    renderAsBia();

    await userEvent.dblClick(trigger());

    expect(current()).toHaveFocus();
    expect(current()).toHaveValue('21');
    expect([
      (current() as HTMLInputElement).selectionStart,
      (current() as HTMLInputElement).selectionEnd,
    ]).toEqual([0, 2]);
    expect(max()).toHaveValue('28');
  });

  it('"−7" and Enter take 7 and close the balloon', async () => {
    renderAsBia();
    await userEvent.dblClick(trigger());

    await retype(current(), '−7{Enter}');

    expect(sent()).toEqual([{ tokenId: LYRA_ID, barId: PV_ID, change: { op: 'add', amount: -7 } }]);
    expect(balloon()).toBeNull();
  });

  it.each([
    ['12', { op: 'set', value: 12 }],
    ['+5', { op: 'add', amount: 5 }],
  ])('"%s" and Enter send %o', async (typed, change) => {
    renderAsBia();
    await userEvent.dblClick(trigger());

    await retype(current(), `${typed}{Enter}`);

    expect(sent()).toEqual([{ tokenId: LYRA_ID, barId: PV_ID, change }]);
  });

  it('"40" in "Máx" and Tab set the maximum', async () => {
    renderAsBia();
    await userEvent.dblClick(trigger());

    await retype(max(), '40');
    await userEvent.tab();

    expect(sent()).toEqual([{ tokenId: LYRA_ID, barId: PV_ID, change: { op: 'max', value: 40 } }]);
  });

  it('leaving "Atual" without changing it sends nothing', async () => {
    renderAsBia();
    await userEvent.dblClick(trigger());

    await userEvent.tab();

    expect(sent()).toEqual([]);
  });

  it('Enter on the focused PV opens the balloon (keyboard)', async () => {
    renderAsBia();

    trigger().focus();
    await userEvent.keyboard('{Enter}');

    expect(balloon()).toBeInTheDocument();
  });

  it('a bar shown as percent opens with the numbers', async () => {
    renderAsBia(cardBar({ id: PV_ID, display: 'percent' }));

    await userEvent.dblClick(trigger());

    expect(current()).toHaveValue('21');
    expect(max()).toHaveValue('28');
  });

  it('"abc" in "Atual" is marked invalid with how to write it, nothing is sent and the balloon stays', async () => {
    renderAsBia();
    await userEvent.dblClick(trigger());

    await retype(current(), 'abc{Enter}');

    expect(current()).toHaveAttribute('aria-invalid', 'true');
    expect(current()).toHaveAccessibleDescription('Escreva −7, +5 ou 12.');
    expect(sent()).toEqual([]);
    expect(balloon()).toBeInTheDocument();
  });

  it('"0" in "Máx" is refused with the range', async () => {
    renderAsBia();
    await userEvent.dblClick(trigger());

    await retype(max(), '0{Enter}');

    expect(max()).toHaveAccessibleDescription('De 1 a 99 999.');
    expect(sent()).toEqual([]);
  });

  it('Esc closes the balloon without sending', async () => {
    renderAsBia();
    await userEvent.dblClick(trigger());

    await retype(current(), '−7{Escape}');

    expect(balloon()).toBeNull();
    expect(sent()).toEqual([]);
  });

  it('a refusal puts the reason on the status line', async () => {
    renderAsBia();
    harness.commands.answerWith({ ok: false, failure: 'forbidden' });
    await userEvent.dblClick(trigger());

    await retype(current(), '−7{Enter}');

    expect(harness.interaction.getState().notice).toBe('forbidden');
  });

  it('Caio, without control of Lyra, has nothing to open on her PV', async () => {
    const theirs = lyra({ bars: [pv], canControl: false });
    harness.render({ state: { tokens: [theirs] }, viewerId: CAIO_AT_TABLE.userId });

    await userEvent.dblClick(screen.getByRole('meter', { name: 'PV de Lyra' }));

    expect(screen.queryByRole('button', { name: 'Editar PV de Lyra' })).toBeNull();
    expect(balloon()).toBeNull();
  });

  it('Ana, the master, opens it on the Lyra of Bia', async () => {
    harness.render({
      state: { tokens: [lyra({ bars: [pv] })] },
      viewerId: ANA_AT_TABLE.userId,
      isMaster: true,
    });

    await userEvent.dblClick(trigger());

    expect(balloon()).toBeInTheDocument();
  });

  it('while reconnecting it does not open', async () => {
    renderAsBia();
    act(() => harness.interaction.getState().setReadOnly(true));

    await userEvent.dblClick(trigger());

    expect(balloon()).toBeNull();
  });
});
