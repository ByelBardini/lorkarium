import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { TrayDiceGrid } from '@/features/dice/tray-dice-grid';
import { EMPTY_TRAY, setLoose, type DiceTray } from '@/lib/dice-tray';

function GridWithTray({ initial }: Readonly<{ initial: DiceTray }>): React.JSX.Element {
  const [tray, setTray] = useState(initial);
  return (
    <>
      <TrayDiceGrid tray={tray} onTray={setTray} />
      <output aria-label="Bandeja">{tray.loose}</output>
    </>
  );
}

function renderGrid(loose = ''): void {
  render(<GridWithTray initial={setLoose(EMPTY_TRAY, loose)} />);
}

function trayText(): string {
  return screen.getByRole('status', { name: 'Bandeja' }).textContent ?? '';
}

describe('TrayDiceGrid', () => {
  it('the "Dados" group has a button per die, d4 to d100, each with a hidden drawing', () => {
    renderGrid();
    const group = screen.getByRole('group', { name: 'Dados' });
    const names = within(group)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));
    expect(names).toEqual([
      'Adicionar d4',
      'Adicionar d6',
      'Adicionar d8',
      'Adicionar d10',
      'Adicionar d12',
      'Adicionar d20',
      'Adicionar d100',
    ]);
    for (const button of within(group).getAllByRole('button')) {
      expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('the d100 shows "d%" and writes 1d100', async () => {
    renderGrid();
    const d100 = screen.getByRole('button', { name: 'Adicionar d100' });
    expect(d100).toHaveTextContent('d%');
    await userEvent.click(d100);
    expect(trayText()).toBe('1d100');
  });

  it('two clicks on the d20 show the count 2, mark the button and describe it as "2 na bandeja"', async () => {
    renderGrid();
    const d20 = screen.getByRole('button', { name: 'Adicionar d20' });
    await userEvent.click(d20);
    await userEvent.click(d20);
    expect(trayText()).toBe('2d20');
    expect(d20).toHaveAccessibleName('Adicionar d20');
    expect(d20).toHaveAccessibleDescription('2 na bandeja');
    expect(d20).toHaveAttribute('data-in-tray', 'true');
    const count = screen.getByText('2', { selector: '[aria-hidden="true"]' });
    expect(count).toBeVisible();
  });

  it('a die off the tray has no count, no description and no "Tirar"', () => {
    renderGrid('2d20');
    const d6 = screen.getByRole('button', { name: 'Adicionar d6' });
    expect(d6).not.toHaveAttribute('data-in-tray');
    expect(d6).not.toHaveAccessibleDescription();
    expect(screen.queryByRole('button', { name: 'Tirar um d6' })).toBeNull();
  });

  it('"Tirar um d20" takes 2d20 to 1d20 and does not add a die', async () => {
    renderGrid('2d20');
    await userEvent.click(screen.getByRole('button', { name: 'Tirar um d20' }));
    expect(trayText()).toBe('1d20');
  });

  it('the count is read from the typed text: 1d20+1d20+3 counts two d20', () => {
    renderGrid('1d20+1d20+3');
    expect(screen.getByRole('button', { name: 'Adicionar d20' })).toHaveAccessibleDescription(
      '2 na bandeja',
    );
  });

  it('an unreadable formula shows no count and no "Tirar"', () => {
    renderGrid('2d20+1d');
    expect(screen.getByRole('button', { name: 'Adicionar d20' })).not.toHaveAccessibleDescription();
    expect(screen.queryByRole('button', { name: /^Tirar um/ })).toBeNull();
  });

  it('the "−" is a 24 px target (size-6)', () => {
    renderGrid('1d8');
    expect(screen.getByRole('button', { name: 'Tirar um d8' })).toHaveClass('size-6');
  });
});
