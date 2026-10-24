import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';

const LINK = '/invite#token=abc';
const DEAD = 'Esse link venceu ou já foi usado. Peça um novo a quem te convidou.';

describe('accepting an invitation (/invite)', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
  });

  function renderAt(path: string): ReturnType<typeof createMemoryRouter> {
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: [path] });
    render(<RouterProvider router={router} />);
    return router;
  }

  async function fill(
    username: string | null,
    password: string,
    repeated = password,
  ): Promise<void> {
    const handle = await screen.findByLabelText('Seu @');
    if (username !== null) {
      await userEvent.clear(handle);
      await userEvent.type(handle, username);
    }
    await userEvent.type(screen.getByLabelText('Senha', { selector: 'input' }), password);
    await userEvent.type(screen.getByLabelText('Repita a senha', { selector: 'input' }), repeated);
    await userEvent.click(screen.getByRole('button', { name: 'Criar minha conta' }));
  }

  it('shows for which address, the @ suggested, and takes the token off the URL', async () => {
    const router = renderAt(LINK);
    expect(
      await screen.findByRole('heading', { name: 'Bem-vindo ao Lorkarium' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Convite para marina@exemplo.com')).toBeInTheDocument();
    expect(screen.getByLabelText('Seu @')).toHaveValue('marina');
    await waitFor(() => expect(router.state.location.hash).toBe(''));
    expect(deps.accountLinksApi.answers.callsOf('inspectInvitation')).toEqual(['abc']);
  });

  it('an @ out of the format, a short password and different passwords stay in their fields', async () => {
    renderAt(LINK);
    await fill('ab', '1234567', 'outra');
    expect(screen.getByLabelText('Seu @')).toHaveAccessibleDescription('Use de 3 a 20 caracteres.');
    expect(screen.getByLabelText('Seu @')).toHaveFocus();
    expect(screen.getByLabelText('Senha', { selector: 'input' })).toHaveAccessibleDescription(
      'A senha precisa de pelo menos 8 caracteres.',
    );
    expect(deps.accountLinksApi.answers.callsOf('acceptInvitation')).toEqual([]);
  });

  it('different passwords say "As senhas não são iguais."', async () => {
    renderAt(LINK);
    await fill(null, 'senha-boa-1', 'senha-boa-2');
    expect(
      screen.getByLabelText('Repita a senha', { selector: 'input' }),
    ).toHaveAccessibleDescription('As senhas não são iguais.');
  });

  it('a taken @ comes back to its field', async () => {
    deps.accountLinksApi.answers.answer('acceptInvitation', {
      ok: false,
      failure: { kind: 'username_taken' },
    });
    renderAt(LINK);
    await fill(null, 'senha-boa-1');
    const handle = await screen.findByLabelText('Seu @');
    await waitFor(() =>
      expect(handle).toHaveAccessibleDescription('@marina já tem dono. Tente outro.'),
    );
  });

  it('accepted: the session is signed in and the home greets by the @', async () => {
    const router = renderAt(LINK);
    await fill(null, 'senha-boa-1');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(deps.sessionStore.getState().session).toMatchObject({ user: { username: 'marina' } });
    expect(await screen.findByRole('heading', { level: 1, name: /marina/ })).toBeInTheDocument();
    expect(deps.accountLinksApi.answers.callsOf('acceptInvitation')).toEqual([
      { token: 'abc', username: 'marina', password: 'senha-boa-1', persistent: false },
    ]);
  });

  it('a dead link at the inspect, or no token, says so without a form', async () => {
    deps.accountLinksApi.answers.answer('inspectInvitation', {
      ok: false,
      failure: { kind: 'link_invalid' },
    });
    renderAt(LINK);
    expect(await screen.findByText(DEAD)).toBeInTheDocument();
    expect(screen.queryByLabelText('Seu @')).toBeNull();
  });

  it('without a token nothing is asked', async () => {
    renderAt('/invite');
    expect(await screen.findByText(DEAD)).toBeInTheDocument();
    expect(deps.accountLinksApi.answers.callsOf('inspectInvitation')).toEqual([]);
  });

  it('a link that died before the click turns into the dead-link sentence', async () => {
    deps.accountLinksApi.answers.answer('acceptInvitation', {
      ok: false,
      failure: { kind: 'link_invalid' },
    });
    renderAt(LINK);
    await fill(null, 'senha-boa-1');
    expect(await screen.findByText(DEAD)).toBeInTheDocument();
  });

  it('signed in as someone else asks to leave first; "Sair e continuar" shows the form', async () => {
    deps.authApi.answerMeWith({ ...ANA, username: 'caio' });
    renderAt(LINK);
    expect(
      await screen.findByText(
        'Você está conectado como @caio. Para aceitar este convite, saia primeiro.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sair e continuar' }));
    expect(await screen.findByLabelText('Seu @')).toBeInTheDocument();
    expect(deps.authApi.logoutCalls).toBe(1);
  });

  it.each([
    [{ kind: 'rate_limited', retryAfterSeconds: 20 }, 'Muitas tentativas. Tente de novo em 20 s.'],
    [{ kind: 'offline' }, 'Sem conexão com o servidor. Confira sua internet e tente de novo.'],
  ] as const)('%o at the accept shows "%s"', async (failure, message) => {
    deps.accountLinksApi.answers.answer('acceptInvitation', { ok: false, failure });
    renderAt(LINK);
    await fill(null, 'senha-boa-1');
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });
});
