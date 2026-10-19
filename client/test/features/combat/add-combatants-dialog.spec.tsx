import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { AddCombatantsDialog } from '@/features/combat/add-combatants-dialog';
import { lyra } from '../../support/table-session-fixtures';

const URSO = lyra({ id: 'urso', name: 'Urso' });
const LOBO = lyra({ id: 'lobo', name: 'Lobo' });
const ENTRIES = [
  { id: 'c-inimigos', label: 'Inimigos' },
  { id: 'c-kael', label: 'Kael' },
];

describe('AddCombatantsDialog', () => {
  let alone: string[][];
  let joined: Array<[string[], string]>;

  beforeEach(() => {
    alone = [];
    joined = [];
    render(
      <AddCombatantsDialog
        tokens={[URSO, LOBO]}
        entries={ENTRIES}
        onAddAlone={(tokenIds) => alone.push(tokenIds)}
        onJoin={(tokenIds, combatantId) => joined.push([tokenIds, combatantId])}
        onClose={() => undefined}
      />,
    );
  });

  it('"Cada um na sua vez", the default, adds each token as an entry of its own', async () => {
    expect(screen.getByRole('radio', { name: 'Cada um na sua vez' })).toBeChecked();

    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(alone).toEqual([['urso', 'lobo']]);
    expect(joined).toEqual([]);
  });

  it('"Entrar em: Inimigos" sends the checked tokens into that entry', async () => {
    await userEvent.click(screen.getByRole('checkbox', { name: 'Lobo' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Inimigos' }));
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(joined).toEqual([[['urso'], 'c-inimigos']]);
    expect(alone).toEqual([]);
  });

  it('with no token checked "Adicionar" is disabled', async () => {
    await userEvent.click(screen.getByRole('checkbox', { name: 'Urso' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Lobo' }));

    expect(screen.getByRole('button', { name: 'Adicionar' })).toBeDisabled();
  });
});
