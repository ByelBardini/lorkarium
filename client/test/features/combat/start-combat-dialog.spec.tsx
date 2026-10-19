import type { CombatEntryInput } from '@lorkarium/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { StartCombatDialog } from '@/features/combat/start-combat-dialog';
import { lyra } from '../../support/table-session-fixtures';

const KAEL = lyra({ id: 'kael', name: 'Kael', side: 'ally' });
const GOBLIN = lyra({ id: 'goblin', name: 'Goblin', side: 'enemy' });
const LOBO = lyra({ id: 'lobo', name: 'Lobo', side: 'enemy' });
const GIGANTE = lyra({ id: 'gigante', name: 'Gigante', side: 'enemy' });

describe('StartCombatDialog', () => {
  let started: CombatEntryInput[][];

  beforeEach(() => {
    started = [];
    render(
      <StartCombatDialog
        tokens={[KAEL, GOBLIN, LOBO, GIGANTE]}
        onConfirm={(entries) => started.push(entries)}
        onClose={() => undefined}
      />,
    );
  });

  it('"Inimigos numa iniciativa só" comes checked', () => {
    expect(screen.getByRole('checkbox', { name: 'Inimigos numa iniciativa só' })).toBeChecked();
  });

  it('"Iniciativa própria" is offered for each enemy only, and only while they go together', async () => {
    expect(screen.getByRole('checkbox', { name: 'Iniciativa própria de Gigante' })).toBeVisible();
    expect(screen.queryByRole('checkbox', { name: 'Iniciativa própria de Kael' })).toBeNull();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Inimigos numa iniciativa só' }));

    expect(screen.queryByRole('checkbox', { name: /^Iniciativa própria/ })).toBeNull();
  });

  it('"Iniciar" with the Gigante on its own initiative sends Kael, Inimigos and the Gigante', async () => {
    await userEvent.click(screen.getByRole('checkbox', { name: 'Iniciativa própria de Gigante' }));
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar' }));

    expect(started).toEqual([
      [
        { name: null, tokenIds: ['kael'] },
        { name: 'Inimigos', tokenIds: ['goblin', 'lobo'] },
        { name: null, tokenIds: ['gigante'] },
      ],
    ]);
  });

  it('an unchecked token stays out of the entries', async () => {
    await userEvent.click(screen.getByRole('checkbox', { name: 'Lobo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar' }));

    expect(started[0]?.flatMap(({ tokenIds }) => tokenIds)).not.toContain('lobo');
  });
});
