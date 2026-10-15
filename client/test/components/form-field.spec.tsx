import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormField } from '@/components/form-field';

describe('FormField', () => {
  it('labels its control by id', () => {
    render(
      <FormField id="nome" label="Nome da mesa" error={undefined}>
        <input id="nome" />
      </FormField>,
    );
    expect(screen.getByLabelText('Nome da mesa')).toHaveAttribute('id', 'nome');
  });

  it('shows the error under the control with the id the control points to', () => {
    render(
      <FormField id="nome" label="Nome da mesa" error="Informe o nome da mesa.">
        <input id="nome" />
      </FormField>,
    );
    expect(screen.getByText('Informe o nome da mesa.')).toHaveAttribute('id', 'nome-error');
  });

  it('shows the hint when there is no error', () => {
    render(
      <FormField id="nome" label="Senha" error={undefined} hint="Opcional.">
        <input id="nome" />
      </FormField>,
    );
    expect(screen.getByText('Opcional.')).toBeInTheDocument();
  });
});
