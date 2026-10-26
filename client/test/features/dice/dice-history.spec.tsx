import type { DiceRolledDto, RolledPartDto } from '@lorkarium/contracts';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { diceHistoryStorageKey } from '@/stores/dice-history-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { biaRolled, biaRolledSecretly, rollIdOf } from '../../support/dice-fixtures';
import { openVharnWithRoster, renderDicePanel } from '../../support/dice-panel-harness';
import { CAIO_AT_TABLE } from '../../support/table-session-fixtures';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';

const STRANGER_ID = '0f9e8d7c-6b5a-4c3d-9e2f-1a0b9c8d7e6f';

function roll(deps: TestDependencies, event: DiceRolledDto): void {
  deps.tableSessionApi.emitTo(VHARN.id, { kind: 'diceRolled', event });
}

function advance(deps: TestDependencies, ms: number): void {
  act(() => deps.diceClock.advance(ms));
}

function history(): HTMLElement {
  return screen.getByRole('list', { name: 'Histórico de rolagens' });
}

function rowsOf(): HTMLElement[] {
  return within(history()).getAllByRole('listitem');
}

function onlyRow(): HTMLElement {
  const [row] = rowsOf();
  if (!row) throw new Error('No history row: expected one roll in the history.');
  return row;
}

/** Bia's "Acerto" as one part with these dice and total. */
function acertoWith(part: Omit<RolledPartDto, 'label'>): DiceRolledDto {
  return biaRolled({ parts: [{ label: 'Acerto', ...part }], total: part.total });
}

describe('DiceHistory', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
    openVharnWithRoster(deps);
  });

  it('Bia’s roll shows who, when, "Acerto" and "…" until revealAtMs, then 22 and the dice', () => {
    renderDicePanel(deps);
    roll(deps, biaRolled());
    const [row] = rowsOf();
    if (!row) throw new Error('No history row: expected Bia’s roll.');
    expect(within(row).getByText('Bia')).toBeInTheDocument();
    expect(row.querySelector('time')).toHaveAttribute('dateTime', '2026-10-25T20:00:00.000Z');
    expect(within(row).getByText('Acerto')).toBeInTheDocument();
    expect(within(row).getByText('…')).toBeInTheDocument();
    expect(within(row).queryByText('22')).toBeNull();
    advance(deps, 2399);
    expect(within(row).getByText('…')).toBeInTheDocument();
    advance(deps, 1);
    expect(within(row).getByText('22')).toBeInTheDocument();
    expect(within(row).getByText('17')).toHaveAttribute('data-status', 'kept');
    expect(within(row).queryByText('…')).toBeNull();
  });

  it('the title counts the rolls: "1 rolagem", then "3 rolagens"', () => {
    renderDicePanel(deps);
    roll(deps, biaRolled({ rollId: rollIdOf(1) }));
    expect(screen.getByText('1 rolagem')).toBeInTheDocument();
    roll(deps, biaRolled({ rollId: rollIdOf(2) }));
    roll(deps, biaRolled({ rollId: rollIdOf(3) }));
    expect(screen.getByText('3 rolagens')).toBeInTheDocument();
  });

  it('an empty history says so and counts nothing', () => {
    renderDicePanel(deps);
    expect(screen.getByText('Nenhuma rolagem nesta visita.')).toBeInTheDocument();
    expect(screen.queryByText(/\d+ rolage(m|ns)$/)).toBeNull();
  });

  it('a row shows the roller’s initials in a circle and the label in gold', () => {
    renderDicePanel(deps);
    roll(deps, biaRolled());
    expect(within(onlyRow()).getByTestId('avatar-initials')).toHaveTextContent('BI');
    expect(within(onlyRow()).getByText('Acerto')).toHaveClass('text-primary');
  });

  it('a roll with advantage says "com vantagem" beside the time; a plain one does not', () => {
    renderDicePanel(deps);
    roll(deps, biaRolled({ rollId: rollIdOf(1) }));
    expect(within(onlyRow()).queryByText(/com vantagem/)).toBeNull();
    const dice: RolledPartDto['dice'] = [
      { sides: 20, value: 17, status: 'kept' },
      { sides: 20, value: 3, status: 'dropped' },
    ];
    roll(deps, acertoWith({ expression: '2d20kh1+5', total: 22, dice }));
    expect(within(rowsOf()[0] ?? onlyRow()).getByText(/com vantagem/)).toBeInTheDocument();
  });

  it('a revealed roll shows the dice, the part’s modifier "+5" and the formula in mono', () => {
    renderDicePanel(deps);
    roll(deps, biaRolled());
    advance(deps, 2400);
    const row = onlyRow();
    expect(within(row).getByText('22')).toHaveClass('font-display');
    expect(within(row).getByText('17')).toHaveAttribute('data-status', 'kept');
    expect(within(row).getByText('+5')).toBeInTheDocument();
    expect(within(row).getByText('1d20+5')).toHaveClass('font-mono');
  });

  it('a natural 20 paints the total gold and says "20 natural"', () => {
    renderDicePanel(deps);
    roll(
      deps,
      acertoWith({
        expression: '1d20+5',
        total: 25,
        dice: [{ sides: 20, value: 20, status: 'kept' }],
      }),
    );
    advance(deps, 2400);
    expect(within(onlyRow()).getByTestId('roll-total')).toHaveClass('text-primary');
    expect(within(onlyRow()).getByText('20 natural')).toBeInTheDocument();
  });

  it('a natural 1 paints the total as an error and says "1 natural"', () => {
    renderDicePanel(deps);
    roll(
      deps,
      acertoWith({
        expression: '1d20+5',
        total: 6,
        dice: [{ sides: 20, value: 1, status: 'kept' }],
      }),
    );
    advance(deps, 2400);
    expect(within(onlyRow()).getByTestId('roll-total')).toHaveClass('text-destructive-text');
    expect(within(onlyRow()).getByText('1 natural')).toBeInTheDocument();
  });

  it('a plain total has no natural mark', () => {
    renderDicePanel(deps);
    roll(deps, biaRolled());
    advance(deps, 2400);
    expect(within(onlyRow()).getByTestId('roll-total')).not.toHaveClass('text-primary');
    expect(within(onlyRow()).queryByText(/natural/)).toBeNull();
  });

  it('a part that counts successes says "4 sucessos"', () => {
    renderDicePanel(deps);
    const values = [7, 10, 3, 6, 7, 1, 9, 2];
    const dice = values.map((value) => ({
      sides: 10,
      value,
      status: 'kept' as const,
      success: value >= 7,
    }));
    roll(deps, acertoWith({ expression: '8d10>=7', total: 4, dice }));
    advance(deps, 2400);
    expect(within(onlyRow()).getByText('4 sucessos')).toBeInTheDocument();
  });

  it('a masters-only roll one sees says "Só o mestre"; a public one does not', () => {
    renderDicePanel(deps);
    roll(deps, biaRolled({ rollId: rollIdOf(1) }));
    expect(within(onlyRow()).queryByText('Só o mestre')).toBeNull();
    roll(deps, biaRolled({ rollId: rollIdOf(2), visibility: 'masters' }));
    expect(within(rowsOf()[0] ?? onlyRow()).getByText('Só o mestre')).toBeInTheDocument();
  });

  it('announces nothing when a roll reveals: the notice over the board does', () => {
    renderDicePanel(deps);
    roll(deps, biaRolled());
    advance(deps, 2400);
    expect(document.querySelector('[aria-live]')).toBeNull();
  });

  it('a masters-only notice says "Bia rolou em segredo." with no value nor "Rolar de novo"', () => {
    renderDicePanel(deps);
    deps.tableSessionApi.emitTo(VHARN.id, {
      kind: 'diceRolledSecretly',
      event: biaRolledSecretly(),
    });
    advance(deps, 800);
    const [row] = rowsOf();
    expect(row).toHaveTextContent('Bia rolou em segredo.');
    if (!row) throw new Error('No history row: expected the notice.');
    expect(within(row).queryByText(/^\d+$/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rolar de novo' })).toBeNull();
  });

  it('"Rolar de novo" on one’s own roll sends its parts, label and visibility again', async () => {
    const user = userEvent.setup();
    renderDicePanel(deps);
    roll(deps, biaRolled({ visibility: 'masters' }));
    await user.click(screen.getByRole('button', { name: 'Rolar de novo' }));
    expect(deps.dice.sent.at(-1)?.request).toMatchObject({
      label: 'Acerto',
      parts: [{ label: 'Acerto', expression: '1d20+5' }],
      visibility: 'masters',
    });
  });

  it('another member’s roll has no "Rolar de novo"', () => {
    renderDicePanel(deps);
    roll(deps, biaRolled({ rollerId: CAIO_AT_TABLE.userId }));
    expect(within(history()).getByText('Caio')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rolar de novo' })).toBeNull();
  });

  it('a spectator has no "Rolar de novo", even on a roll of the same account', () => {
    renderDicePanel(deps, 'spectator');
    roll(deps, biaRolled());
    expect(screen.queryByRole('button', { name: 'Rolar de novo' })).toBeNull();
  });

  it('someone no longer in the roster is "Alguém"', () => {
    renderDicePanel(deps);
    roll(deps, biaRolled({ rollerId: STRANGER_ID }));
    expect(within(history()).getByText('Alguém')).toBeInTheDocument();
  });

  it('the newest roll comes first', () => {
    renderDicePanel(deps);
    roll(deps, biaRolled({ rollId: rollIdOf(1), label: 'Primeira' }));
    roll(deps, biaRolled({ rollId: rollIdOf(2), label: 'Segunda' }));
    expect(rowsOf().map((row) => within(row).queryByText(/Primeira|Segunda/)?.textContent)).toEqual(
      ['Segunda', 'Primeira'],
    );
  });

  it('a multi-part roll shows the sum once revealed', () => {
    renderDicePanel(deps);
    roll(
      deps,
      biaRolled({
        label: 'Acerto + Bênção',
        parts: [
          {
            label: 'Acerto',
            expression: '1d20+5',
            total: 22,
            dice: [{ sides: 20, value: 17, status: 'kept', model: [0] }],
          },
          {
            label: 'Bênção',
            expression: '1d4',
            total: 3,
            dice: [{ sides: 4, value: 3, status: 'kept' }],
          },
        ],
        total: 25,
      }),
    );
    advance(deps, 2400);
    expect(within(history()).getByText('Acerto 22 + Bênção 3 = 25')).toBeInTheDocument();
  });
});

describe('DiceHistory after an F5', () => {
  it('a roll already revealed shows its value at once', () => {
    const deps = testDependencies();
    const played = biaRolled();
    // What the store writes: no throw, no model on the dice.
    const stored: DiceRolledDto = {
      ...played,
      throw: null,
      parts: played.parts.map((part) => ({
        ...part,
        dice: part.dice.map(({ sides, value, status }) => ({ sides, value, status })),
      })),
    };
    deps.tabStorage.setItem(
      diceHistoryStorageKey(VHARN.id),
      JSON.stringify([{ kind: 'rolled', event: stored, receivedAtMs: 0, revealAtMs: 2400 }]),
    );
    deps.diceClock.advance(60_000);
    openVharnWithRoster(deps);
    renderDicePanel(deps);
    expect(within(history()).getByText('22')).toBeInTheDocument();
  });
});
