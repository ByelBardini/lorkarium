import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { TEST_SITE_KEY } from '../../support/sign-up-api-fake';
import { TurnstileScriptFake } from '../../support/turnstile-script-fake';

const CLOSED = 'O cadastro está fechado no momento.';

describe('the public sign-up (/sign-up)', () => {
  let deps: TestDependencies;
  let turnstile: TurnstileScriptFake;

  beforeEach(() => {
    deps = testDependencies();
    turnstile = new TurnstileScriptFake().preload();
  });

  afterEach(() => turnstile.uninstall());

  function renderSignUp(): void {
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: ['/sign-up'] });
    render(<RouterProvider router={router} />);
  }

  async function send(email: string): Promise<void> {
    await userEvent.type(await screen.findByLabelText('E-mail'), email);
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
  }

  it('an address sent says to check the inbox, naming it and the 24 hours of the link', async () => {
    renderSignUp();
    expect(await screen.findByRole('heading', { name: 'Crie sua conta' })).toBeInTheDocument();
    await send(' Ana@Exemplo.com ');
    expect(await screen.findByRole('heading', { name: 'Confira seu e-mail' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Mandamos um e-mail para ana@exemplo.com. O link dele vale 24 horas.',
    );
    expect(screen.queryByLabelText('E-mail')).not.toBeInTheDocument();
  });

  it('without a site key (dev) the request goes with the skipped token and no widget', async () => {
    renderSignUp();
    await send('ana@exemplo.com');
    await screen.findByRole('heading', { name: 'Confira seu e-mail' });
    expect(deps.signUpApi.answers.callsOf('requestSignUp')).toEqual([
      { email: 'ana@exemplo.com', humanCheckToken: 'skipped' },
    ]);
    expect(turnstile.rendered).toEqual([]);
  });

  it('an address out of the format stays in the field, focused, and nothing is sent', async () => {
    renderSignUp();
    await send('ana@');
    const field = screen.getByLabelText('E-mail');
    expect(field).toHaveAccessibleDescription('Informe um e-mail, como voce@exemplo.com.');
    expect(field).toHaveFocus();
    expect(deps.signUpApi.answers.callsOf('requestSignUp')).toEqual([]);
  });

  it('with a site key "Criar conta" waits for the challenge, then sends its token', async () => {
    deps.signUpApi.withSiteKey();
    renderSignUp();
    await userEvent.type(await screen.findByLabelText('E-mail'), 'ana@exemplo.com');
    const create = screen.getByRole('button', { name: 'Criar conta' });
    expect(create).toBeDisabled();
    expect(turnstile.rendered.map(({ options }) => options.sitekey)).toEqual([TEST_SITE_KEY]);
    act(() => turnstile.solve('token-da-ana'));
    await userEvent.click(create);
    await screen.findByRole('heading', { name: 'Confira seu e-mail' });
    expect(deps.signUpApi.answers.callsOf('requestSignUp')).toEqual([
      { email: 'ana@exemplo.com', humanCheckToken: 'token-da-ana' },
    ]);
  });

  it('a challenge refused by the server says so and asks for a new one', async () => {
    deps.signUpApi.withSiteKey();
    deps.signUpApi.answers.answer('requestSignUp', {
      ok: false,
      failure: { kind: 'human_check_failed' },
    });
    renderSignUp();
    await screen.findByLabelText('E-mail');
    act(() => turnstile.solve());
    await send('ana@exemplo.com');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A verificação não passou. Faça de novo e envie.',
    );
    expect(turnstile.rendered).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Criar conta' })).toBeDisabled();
  });

  it('registration closed by the settings shows the notice and no form', async () => {
    deps.signUpApi.answers.answer('settings', {
      ok: true,
      value: { registrationOpen: false, humanCheckSiteKey: null },
    });
    renderSignUp();
    expect(await screen.findByText(CLOSED)).toBeInTheDocument();
    expect(screen.queryByLabelText('E-mail')).not.toBeInTheDocument();
  });

  it('registration closed meanwhile (the request refused) shows the notice and no form', async () => {
    deps.signUpApi.answers.answer('requestSignUp', {
      ok: false,
      failure: { kind: 'registration_closed' },
    });
    renderSignUp();
    await send('ana@exemplo.com');
    expect(await screen.findByText(CLOSED)).toBeInTheDocument();
    expect(screen.queryByLabelText('E-mail')).not.toBeInTheDocument();
  });

  it('too many requests says how many minutes to wait', async () => {
    deps.signUpApi.answers.answer('requestSignUp', {
      ok: false,
      failure: { kind: 'rate_limited', retryAfterSeconds: 90 },
    });
    renderSignUp();
    await send('ana@exemplo.com');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Muitos pedidos. Tente de novo em 2 min.',
    );
  });

  it('settings that do not arrive say so instead of the form', async () => {
    deps.signUpApi.answers.answer('settings', { ok: false, failure: { kind: 'offline' } });
    renderSignUp();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sem conexão com o servidor. Confira sua internet e tente de novo.',
    );
    expect(screen.queryByLabelText('E-mail')).not.toBeInTheDocument();
  });

  it('signed in already asks to leave first; "Sair e continuar" shows the form', async () => {
    deps.authApi.answerMeWith({ ...ANA, username: 'caio' });
    renderSignUp();
    expect(
      await screen.findByText(
        'Você já está conectado como @caio. Para criar outra conta, saia primeiro.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sair e continuar' }));
    expect(await screen.findByLabelText('E-mail')).toBeInTheDocument();
    await waitFor(() => expect(deps.authApi.logoutCalls).toBe(1));
  });
});
