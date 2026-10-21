import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ConeAngleField } from '@/components/cone-angle-field';

function Harness({ error, typed }: Readonly<{ error?: string; typed: string[] }>) {
  const [value, setValue] = useState('360');
  return (
    <ConeAngleField
      label="Campo de visão (°)"
      value={value}
      error={error}
      hint="360 = vê para todo lado."
      onChange={(next) => {
        typed.push(next);
        setValue(next);
      }}
    />
  );
}

describe('ConeAngleField', () => {
  it('shows the opening under its label, with the hint below', () => {
    render(<Harness typed={[]} />);

    expect(screen.getByLabelText('Campo de visão (°)')).toHaveValue('360');
    expect(screen.getByText('360 = vê para todo lado.')).toBeInTheDocument();
  });

  it('typing "90" hands each text to onChange as typed', async () => {
    const typed: string[] = [];
    render(<Harness typed={typed} />);
    const field = screen.getByLabelText('Campo de visão (°)');

    await userEvent.clear(field);
    await userEvent.type(field, '90');

    expect(typed.at(-1)).toBe('90');
    expect(field).toHaveValue('90');
  });

  it('an error replaces the hint, marks the field invalid and describes it', () => {
    render(<Harness typed={[]} error="De 1 a 360°." />);
    const field = screen.getByLabelText('Campo de visão (°)');

    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription('De 1 a 360°.');
    expect(screen.queryByText('360 = vê para todo lado.')).not.toBeInTheDocument();
  });
});
