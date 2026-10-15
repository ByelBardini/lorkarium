import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { PasswordField } from '@/components/password-field';

function Harness(): React.JSX.Element {
  const [value, setValue] = useState('segredo');
  return (
    <>
      <label htmlFor="senha">Senha</label>
      <PasswordField id="senha" value={value} onValueChange={setValue} invalid={false} />
    </>
  );
}

describe('PasswordField', () => {
  it('starts hidden with a "Mostrar senha" toggle', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Mostrar senha' })).toBeInTheDocument();
  });

  it('the toggle reveals the password and renames itself "Ocultar senha"', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ocultar senha' })).toBeInTheDocument();
  });

  it('a second toggle hides it again', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password');
  });
});
