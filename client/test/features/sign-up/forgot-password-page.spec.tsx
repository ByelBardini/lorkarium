import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { TurnstileScriptFake } from '../../support/turnstile-script-fake';

const FIELD = 'E-mail ou @';
const SENT = 'Se existir uma conta com esse e-mail ou @, mandamos um link. Ele vale 1 hora.';

describe('asking for a new password (/forgot-password)', () => {
  let deps: TestDependencies;
  let turnstile: TurnstileScriptFake;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith(null);
    turnstile = new TurnstileScriptFake().preload();
  });

  afterEach(() => turnstile.uninstall());

  function renderAt(path: string): ReturnType<typeof createMemoryRouter> {
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: [path] });
    render(<RouterProvider router={router} />);
    return router;
  }

  async function send(identifier: string): Promise<void> {
    await userEvent.type(await screen.findByLabelText(FIELD), identifier);
    await userEvent.click(screen.getByRole('button', { name: 'Mandar link' }));
  }

  it('"Esqueci minha senha" in the login brings what was typed in the e-mail or @ field', async () => {
    const router = renderAt('/login');
    await userEvent.type(await screen.findByLabelText('E-mail ou usuário'), '@biaflor');
    await userEvent.click(screen.getByRole('button', { name: 'Esqueci minha senha' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/forgot-password'));
    expect(await screen.findByLabelText(FIELD)).toHaveValue('@biaflor');
    expect(router.state.location.search).toBe('');
  });

  it('sent: the same sentence for any value, and the @ goes as the login reads it', async () => {
    renderAt('/forgot-password');
    expect(await screen.findByRole('heading', { name: 'Esqueci minha senha' })).toBeInTheDocument();
    await send('@BiaFlor');
    expect(await screen.findByRole('status')).toHaveTextContent(SENT);
    expect(screen.queryByLabelText(FIELD)).not.toBeInTheDocument();
    expect(deps.signUpApi.answers.callsOf('requestPasswordReset')).toEqual([
      { identifier: 'biaflor', humanCheckToken: 'skipped' },
    ]);
  });

  it('an empty field is not sent: it says so and takes the focus', async () => {
    renderAt('/forgot-password');
    await userEvent.click(await screen.findByRole('button', { name: 'Mandar link' }));
    const field = screen.getByLabelText(FIELD);
    expect(field).toHaveAccessibleDescription('Informe seu e-mail ou @.');
    expect(field).toHaveFocus();
    expect(deps.signUpApi.answers.callsOf('requestPasswordReset')).toEqual([]);
  });

  it('a value that is neither an e-mail nor an @ is not sent', async () => {
    renderAt('/forgot-password');
    await send('ana@');
    expect(screen.getByLabelText(FIELD)).toHaveAccessibleDescription(
      'Informe um e-mail, como voce@exemplo.com, ou seu @, como @bia.',
    );
    expect(deps.signUpApi.answers.callsOf('requestPasswordReset')).toEqual([]);
  });

  it('with a site key "Mandar link" waits for the challenge, then sends its token', async () => {
    deps.signUpApi.withSiteKey();
    renderAt('/forgot-password');
    await userEvent.type(await screen.findByLabelText(FIELD), 'bia@exemplo.com');
    const send = screen.getByRole('button', { name: 'Mandar link' });
    expect(send).toBeDisabled();
    act(() => turnstile.solve('token-da-bia'));
    await userEvent.click(send);
    await screen.findByRole('status');
    expect(deps.signUpApi.answers.callsOf('requestPasswordReset')).toEqual([
      { identifier: 'bia@exemplo.com', humanCheckToken: 'token-da-bia' },
    ]);
  });

  it('too many requests says how many minutes to wait', async () => {
    deps.signUpApi.answers.answer('requestPasswordReset', {
      ok: false,
      failure: { kind: 'rate_limited', retryAfterSeconds: 600 },
    });
    renderAt('/forgot-password');
    await send('biaflor');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Muitos pedidos. Tente de novo em 10 min.',
    );
  });

  it('works with registration closed: the new password does not depend on it', async () => {
    deps.signUpApi.answers.answer('settings', {
      ok: true,
      value: { registrationOpen: false, humanCheckSiteKey: null },
    });
    renderAt('/forgot-password');
    await send('biaflor');
    expect(await screen.findByRole('status')).toHaveTextContent(SENT);
  });
});
