import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthFrame } from '@/features/auth/auth-frame';

describe('AuthFrame', () => {
  it('the foot links the Terms of use and the Privacy policy', () => {
    render(
      <AuthFrame pageTitle="Lorkarium · Entrar" heading="Bem-vindo de volta">
        <p>formulário</p>
      </AuthFrame>,
    );
    const legal = screen.getByRole('navigation', { name: 'Documentos legais' });
    expect(within(legal).getByRole('link', { name: 'Termos de uso' })).toHaveAttribute(
      'href',
      '/api/legal/terms',
    );
    expect(within(legal).getByRole('link', { name: 'Política de privacidade' })).toHaveAttribute(
      'href',
      '/api/legal/privacy',
    );
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
