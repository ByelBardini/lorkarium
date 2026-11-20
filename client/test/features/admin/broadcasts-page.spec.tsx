import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { ANA_SECURITY } from '../../support/account-security-api-fake';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ROOT_ADMIN } from '../../support/auth-api-fake';
import { mailBroadcast } from '../../support/broadcasts-api-fake';

const SENDING = mailBroadcast({
  id: '0b9e8d7c-6a5b-4c3d-9e2f-1a0b9c8d7e6f',
  subject: 'Os preços do Narrador mudam',
  segment: { plan: 'narrador' },
  confirmedAt: '2026-11-18T12:00:00.000Z',
  total: 1300,
  sent: 1240,
  failed: 3,
});

describe('backoffice notices (/admin/comunicados)', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ROOT_ADMIN);
    deps.accountSecurityApi.currentSecurity = {
      ...ANA_SECURITY,
      twoFactor: { enabled: true, recoveryCodesLeft: 10 },
    };
    deps.broadcastsApi.broadcasts = [SENDING];
  });

  async function open(): Promise<void> {
    const entries = ['/admin/comunicados'];
    render(
      <RouterProvider
        router={createMemoryRouter(buildRoutes(deps), { initialEntries: entries })}
      />,
    );
    await screen.findByRole('heading', { name: 'Comunicados' });
  }

  async function write(): Promise<void> {
    await userEvent.type(screen.getByLabelText('Assunto'), 'Os preços mudam em 30 dias');
    await userEvent.type(screen.getByLabelText('Título'), 'Novos preços');
    await userEvent.type(
      screen.getByLabelText('Texto'),
      'A partir de janeiro.{enter}{enter}Nada muda até lá.',
    );
  }

  function sendButton(): HTMLElement {
    return screen.getByRole('button', { name: /^Enviar para/ });
  }

  it('the side offers "Comunicados" (current) and the title names the page', async () => {
    await open();
    const nav = screen.getByRole('navigation', { name: 'Backoffice' });
    expect(within(nav).getByRole('link', { name: 'Comunicados' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await waitFor(() => expect(document.title).toBe('Lorkarium · Comunicados'));
  });

  it('choosing the segment says how many accounts it reaches', async () => {
    await open();
    expect(await screen.findByText('Vai para 1.300 contas.')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Para quem'), 'plan:lenda');
    expect(await screen.findByText('Vai para 40 contas.')).toBeInTheDocument();
    expect(deps.broadcastsApi.calls.at(-1)?.args).toEqual([{ plan: 'lenda' }]);
  });

  it('the preview shows the HTML the server rendered, in a sandboxed frame', async () => {
    await open();
    await write();
    await userEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    const frame = await screen.findByTitle('Prévia do e-mail');
    expect(frame).toHaveAttribute('sandbox', '');
    expect(frame.getAttribute('srcdoc')).toContain('<h1>Novos preços</h1>');
  });

  it('with nothing written "Enviar para N" is disabled', async () => {
    await open();
    expect(await screen.findByText('Vai para 1.300 contas.')).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
  });

  it('"Enviar para N" stays disabled until a test of this text was sent', async () => {
    await open();
    await write();
    expect(await screen.findByText('Vai para 1.300 contas.')).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
  });

  it('test, then send: the test saves the draft, and the send asks to type N before confirming', async () => {
    await open();
    await write();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar teste para mim' }));
    expect(await screen.findByText('Teste enviado para fernanda@mesa.com.')).toBeInTheDocument();
    await userEvent.click(sendButton());
    const confirm = screen.getByRole('button', { name: 'Confirmar envio' });
    await userEvent.type(screen.getByLabelText('Digite 1.300 para confirmar'), '1299');
    expect(confirm).toBeDisabled();
    await userEvent.clear(screen.getByLabelText('Digite 1.300 para confirmar'));
    await userEvent.type(screen.getByLabelText('Digite 1.300 para confirmar'), '1.300');
    await userEvent.click(confirm);
    expect(
      await screen.findByText('Comunicado confirmado: 1.300 e-mails na fila de envio.'),
    ).toBeInTheDocument();
    expect(deps.broadcastsApi.methods().filter((m) => m !== 'audience' && m !== 'list')).toEqual([
      'create',
      'sendTest',
      'confirm',
    ]);
    expect(deps.broadcastsApi.calls.at(-1)?.args[1]).toBe(1300);
  });

  it('editing the text after the test asks for a new test', async () => {
    await open();
    await write();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar teste para mim' }));
    await screen.findByText('Teste enviado para fernanda@mesa.com.');
    expect(sendButton()).toBeEnabled();
    await userEvent.type(screen.getByLabelText('Título'), '!');
    expect(sendButton()).toBeDisabled();
  });

  it('an invalid text says what to fix and sends nothing', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar teste para mim' }));
    expect(await screen.findByText('O assunto vai de 1 a 120 caracteres.')).toBeInTheDocument();
    expect(deps.broadcastsApi.methods()).not.toContain('create');
  });

  it('without 2FA the reason takes the place of the send button', async () => {
    deps.accountSecurityApi.currentSecurity = ANA_SECURITY;
    await open();
    expect(
      screen.getByText(
        'Ative a verificação em duas etapas da sua conta para enviar um comunicado.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Enviar para/ })).not.toBeInTheDocument();
  });

  it('an audience that changed since the preview is refused with the reason and counted again', async () => {
    await open();
    await write();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar teste para mim' }));
    await screen.findByText('Teste enviado para fernanda@mesa.com.');
    await userEvent.click(sendButton());
    deps.broadcastsApi.failures.confirm = { kind: 'confirmation_mismatch' };
    deps.broadcastsApi.audiences = { ...deps.broadcastsApi.audiences, all: 1301 };
    await userEvent.type(screen.getByLabelText('Digite 1.300 para confirmar'), '1300');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar envio' }));
    expect(await screen.findByText(/O número de contas mudou desde a prévia/)).toBeInTheDocument();
    expect(await screen.findByText('Vai para 1.301 contas.')).toBeInTheDocument();
  });

  it('the list shows each notice with its segment and progress', async () => {
    await open();
    const list = screen.getByRole('list', { name: 'Comunicados' });
    expect(within(list).getByText('Os preços do Narrador mudam')).toBeInTheDocument();
    expect(within(list).getByText('Quem paga o plano Narrador · Enviando')).toBeInTheDocument();
    expect(within(list).getByText('1.240 de 1.300 enviados · 3 falhas')).toBeInTheDocument();
  });
});
