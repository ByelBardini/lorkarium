import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthFrame } from '@/features/auth/auth-frame';

describe('AuthFrame', () => {
  it.each([
    ['Termos de uso', '/api/legal/terms'],
    ['Política de privacidade', '/api/legal/privacy'],
    ['Política de uso', '/api/legal/acceptable-use'],
    ['Código-fonte', 'https://github.com/ByelBardini/lorkarium'],
  ])('the foot links "%s" to %s in a new tab', (name, href) => {
    render(
      <AuthFrame pageTitle="Lorkarium · Entrar" heading="Bem-vindo de volta">
        <p>formulário</p>
      </AuthFrame>,
    );
    const legal = screen.getByRole('navigation', { name: 'Documentos legais' });
    const link = within(legal).getByRole('link', { name });
    expect(link).toHaveAttribute('href', href);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('legalLinks={false} leaves them out and still shows the footer content', () => {
    render(
      <AuthFrame
        pageTitle="Lorkarium · Aceitar convite"
        heading="Bem-vindo ao Lorkarium"
        legalLinks={false}
        footer={<p>crédito</p>}
      >
        <p>formulário</p>
      </AuthFrame>,
    );
    expect(screen.queryByRole('navigation', { name: 'Documentos legais' })).toBeNull();
    expect(screen.getByText('crédito')).toBeInTheDocument();
  });
});
