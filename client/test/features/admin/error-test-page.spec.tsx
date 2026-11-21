import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ClientErrorTest } from '@/features/admin/client-error-test';
import { ErrorTestPage } from '@/features/admin/error-test-page';
import { ErrorReportsApiFake } from '../../support/error-reports-api-fake';

function renderPage(api = new ErrorReportsApiFake()) {
  const thrown: Error[] = [];
  render(<ErrorTestPage api={api} scheduleThrow={(error) => thrown.push(error)} />);
  return { api, thrown };
}

describe('ErrorTestPage', () => {
  it('"Gerar erro no server" calls the test once and says where to look', async () => {
    const { api } = renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Gerar erro no server' }));
    expect(api.serverTests).toBe(1);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'O server respondeu 500. Confira a issue no Sentry.',
    );
  });

  it('a server that does not answer the 500 says so', async () => {
    const api = new ErrorReportsApiFake();
    api.serverTestAnswer = 'offline';
    renderPage(api);
    await userEvent.click(screen.getByRole('button', { name: 'Gerar erro no server' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Sem conexão com o server.');
  });

  it('"Gerar erro no navegador" throws one ClientErrorTest outside React and says so', async () => {
    const { thrown } = renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Gerar erro no navegador' }));
    expect(thrown).toHaveLength(1);
    expect(thrown[0]).toBeInstanceOf(ClientErrorTest);
    expect(screen.getByRole('status')).toHaveTextContent('Erro lançado no navegador.');
  });

  it('while the server test runs the button is off and reads "Gerando…"', async () => {
    const api = new ErrorReportsApiFake().holdServerTest();
    renderPage(api);
    await userEvent.click(screen.getByRole('button', { name: 'Gerar erro no server' }));
    expect(screen.getByRole('button', { name: 'Gerando…' })).toBeDisabled();
    await act(async () => api.releaseServerTest());
    expect(screen.getByRole('button', { name: 'Gerar erro no server' })).toBeEnabled();
  });
});
