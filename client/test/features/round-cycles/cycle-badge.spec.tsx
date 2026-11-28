import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CycleBadge } from '@/features/round-cycles/cycle-badge';
import type { CycleBadge as CycleBadgeView } from '@/lib/round-cycle-view';

const phase = (name: string) => ({
  phaseId: `p-${name}`,
  name,
  icon: 'game-icons:cycle' as const,
  imageAssetId: null,
});

const badge: CycleBadgeView = {
  cycleId: 'moon',
  name: 'Fases da Lua',
  round: 3,
  current: phase('Lua Cheia'),
  next: phase('Minguante'),
  chosen: false,
  canChoose: true,
  options: [
    { ...phase('Lua Cheia'), tag: 'current', isNext: false },
    { ...phase('Minguante'), tag: 'follows', isNext: true },
  ],
};

describe('CycleBadge', () => {
  it('a confirmed pick closes the list', async () => {
    render(<CycleBadge badge={badge} onPick={async () => true} />);
    await userEvent.click(screen.getByRole('button', { name: 'Próxima: Minguante' }));

    await userEvent.click(screen.getByRole('button', { name: /Lua Cheia/ }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('a chosen next phase is labeled as chosen', () => {
    render(<CycleBadge badge={{ ...badge, chosen: true }} onPick={async () => true} />);
    expect(
      screen.getByRole('button', { name: 'Próxima · escolhida: Minguante' }),
    ).toBeInTheDocument();
  });

  it('a cycle with no next phase shows only the current one', () => {
    render(<CycleBadge badge={{ ...badge, next: null }} onPick={async () => true} />);
    expect(screen.getByRole('group')).toHaveTextContent('Fases da Lua · rodada 3Lua Cheia');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
