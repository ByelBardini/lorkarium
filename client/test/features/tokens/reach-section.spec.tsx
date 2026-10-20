import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ReachSection, type ReachTyped } from '@/features/tokens/reach-section';

const METERS = { cellDistance: 1.5, cellUnit: 'm' };

function Harness({ startOn = true }: Readonly<{ startOn?: boolean }>) {
  const [on, setOn] = useState(startOn);
  const [range, setRange] = useState<ReachTyped>({ bright: '6', dim: '12' });
  return (
    <>
      <ReachSection
        icon={null}
        title="Emite luz"
        hint={on ? 'Acesa.' : 'Apagada.'}
        on={on}
        onSwitch={setOn}
        range={range}
        errors={{ dim: on ? undefined : 'nunca' }}
        distance={METERS}
        onRange={setRange}
        note="Uma nota."
      />
      <output aria-label="Alcance">{`${range.bright}/${range.dim}`}</output>
    </>
  );
}

describe('ReachSection', () => {
  it('is a group named by its title, with a switch of the same name', () => {
    render(<Harness />);

    expect(screen.getByRole('group', { name: 'Emite luz' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Emite luz' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('on, it shows both fields "até" and the note; typing changes the range', async () => {
    render(<Harness />);

    await userEvent.clear(screen.getByLabelText('Penumbra até (m)'));
    await userEvent.type(screen.getByLabelText('Penumbra até (m)'), '9');

    expect(screen.getByLabelText('Plena até (m)')).toHaveValue('6');
    expect(screen.getByText('Uma nota.')).toBeInTheDocument();
    expect(screen.getByLabelText('Alcance')).toHaveTextContent('6/9');
  });

  it('off, the fields and the note go, and the hint changes', async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole('switch', { name: 'Emite luz' }));

    expect(screen.queryByLabelText('Plena até (m)')).not.toBeInTheDocument();
    expect(screen.queryByText('Uma nota.')).not.toBeInTheDocument();
    expect(screen.getByText('Apagada.')).toBeInTheDocument();
  });
});
