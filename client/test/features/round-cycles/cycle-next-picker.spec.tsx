import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CycleNextPicker } from '@/features/round-cycles/cycle-next-picker';
import type { CycleOption } from '@/lib/round-cycle-view';

const option = (name: string, extra: Partial<CycleOption> = {}): CycleOption => ({
  phaseId: `p-${name}`,
  name,
  icon: 'game-icons:cycle' as const,
  imageAssetId: null,
  tag: null,
  isNext: false,
  ...extra,
});

const OPTIONS = [
  option('Nova', { isNext: true }),
  option('Crescente', { tag: 'current' }),
  option('Cheia', { tag: 'follows' }),
];

describe('CycleNextPicker', () => {
  it('names the round the pick is for and presses the phase the next round plays', () => {
    render(<CycleNextPicker round={4} options={OPTIONS} onPick={() => undefined} busy={false} />);
    expect(screen.getByText('Fase da rodada 4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nova/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Cheia/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('picking the current phase repeats it by its id', async () => {
    const picked: (string | null)[] = [];
    render(
      <CycleNextPicker round={4} options={OPTIONS} onPick={(id) => picked.push(id)} busy={false} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Crescente/ }));
    expect(picked).toEqual(['p-Crescente']);
  });

  it('while a pick is on its way every phase is disabled', () => {
    render(<CycleNextPicker round={4} options={OPTIONS} onPick={() => undefined} busy />);
    expect(screen.getAllByRole('button').every((button) => button.hasAttribute('disabled'))).toBe(
      true,
    );
  });
});
