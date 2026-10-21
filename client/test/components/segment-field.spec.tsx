import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { SegmentField, type SegmentOption } from '@/components/segment-field';

type Pace = 'walk' | 'run' | 'fly';

const PACES: readonly SegmentOption<Pace>[] = [
  { value: 'walk', label: 'Andar' },
  { value: 'run', label: 'Correr' },
  { value: 'fly', label: 'Voar', disabled: true },
];

function Harness({ hint }: Readonly<{ hint?: string }>) {
  const [pace, setPace] = useState<Pace>('walk');
  return (
    <>
      <SegmentField legend="Passo" value={pace} options={PACES} hint={hint} onChange={setPace} />
      <output aria-label="Escolhido">{pace}</output>
    </>
  );
}

describe('SegmentField', () => {
  it('is a radiogroup named by its legend; clicking a segment chooses it', async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole('radio', { name: 'Correr' }));

    expect(screen.getByRole('radiogroup', { name: 'Passo' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Correr' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Escolhido')).toHaveTextContent('run');
  });

  it('compact keeps the legend as the name of the group but only for screen readers', () => {
    render(
      <SegmentField
        legend="Passo"
        value="walk"
        options={PACES}
        compact
        onChange={() => undefined}
      />,
    );

    expect(screen.getByRole('radiogroup', { name: 'Passo' })).toBeInTheDocument();
    expect(screen.getByText('Passo')).toHaveClass('sr-only');
    expect(screen.getByRole('radio', { name: 'Andar' })).toHaveClass('h-7');
  });

  it('fill makes the segments share the line; without it each keeps its width', () => {
    const { rerender } = render(
      <SegmentField legend="Passo" value="walk" options={PACES} fill onChange={() => undefined} />,
    );
    expect(screen.getByRole('radio', { name: 'Andar' })).toHaveClass('flex-1');

    rerender(
      <SegmentField legend="Passo" value="walk" options={PACES} onChange={() => undefined} />,
    );

    expect(screen.getByRole('radio', { name: 'Andar' })).not.toHaveClass('flex-1');
  });

  it('a disabled segment cannot be chosen', async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole('radio', { name: 'Voar' }));

    expect(screen.getByRole('radio', { name: 'Voar' })).toBeDisabled();
    expect(screen.getByLabelText('Escolhido')).toHaveTextContent('walk');
  });

  it('the hint describes the group', () => {
    render(<Harness hint="Só no chão." />);

    expect(screen.getByRole('radiogroup', { name: 'Passo' })).toHaveAccessibleDescription(
      'Só no chão.',
    );
  });
});
