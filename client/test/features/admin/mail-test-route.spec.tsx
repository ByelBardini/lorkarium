import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ROOT_ADMIN } from '../../support/auth-api-fake';

describe('backoffice mail test (/admin/emails)', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ROOT_ADMIN);
  });

  async function open(): Promise<void> {
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: ['/admin/emails'] });
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { name: 'E-mails' });
  }

  function field(): HTMLElement {
    return screen.getByLabelText('E-mail de destino');
  }

  it('the side offers "E-mails" (current) and the field starts with the admin address', async () => {
    await open();
    const nav = screen.getByRole('navigation', { name: 'Backoffice' });
    expect(within(nav).getByRole('link', { name: 'E-mails' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(field()).toHaveValue(ROOT_ADMIN.email);
    await waitFor(() => expect(document.title).toBe('Lorkarium · E-mails'));
  });

  it('lists one button per system e-mail, with its subject', async () => {
    await open();
    const list = screen.getByRole('list', { name: 'E-mails do sistema' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).getByText('Seu convite para o Lorkarium')).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Enviar Convite' })).toBeInTheDocument();
  });

  it('a button sends that e-mail to the typed address and says so', async () => {
    await open();
    await userEvent.clear(field());
    await userEvent.type(field(), 'Eu@Exemplo.com');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar Acesso suspenso' }));
    expect(
      await screen.findByText(
        '“Seu acesso ao Lorkarium foi suspenso” enviado para eu@exemplo.com.',
      ),
    ).toHaveAttribute('role', 'status');
    expect(deps.userAdminApi.answers.callsOf('sendMailSample')).toEqual([
      { sampleId: 'access-suspended', to: 'eu@exemplo.com' },
    ]);
  });

  it('an invalid address stays in the field, focused, without a request', async () => {
    await open();
    await userEvent.clear(field());
    await userEvent.type(field(), 'eu');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar Convite' }));
    expect(field()).toHaveAccessibleDescription('Informe um e-mail válido, como voce@exemplo.com.');
    expect(field()).toHaveFocus();
    expect(deps.userAdminApi.answers.callsOf('sendMailSample')).toEqual([]);
  });

  it('while one goes, its button says "Enviando…" and the others wait', async () => {
    const release = deps.userAdminApi.answers.hold('sendMailSample');
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar Convite' }));
    expect(await screen.findByText('Enviando…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar Acesso suspenso' })).toBeDisabled();
    release({
      ok: true,
      value: { subject: 'Seu convite para o Lorkarium', to: ROOT_ADMIN.email },
    });
    // The status region is always mounted (empty): wait for the text, not for the node.
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('enviado para'));
  });

  it('a mail server down says so in an alert', async () => {
    deps.userAdminApi.answers.answer('sendMailSample', {
      ok: false,
      failure: { kind: 'mail_delivery_failed' },
    });
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar Convite' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O servidor de e-mail recusou ou não respondeu. Confira o SMTP_URL do server e tente de novo.',
    );
  });

  it('a player at /admin/emails is sent home (the guard)', async () => {
    deps.authApi.answerMeWith({ ...ROOT_ADMIN, role: 'user' });
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: ['/admin/emails'] });
    render(<RouterProvider router={router} />);
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });
});
