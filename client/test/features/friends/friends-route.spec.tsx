import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import {
  BIA,
  CAIO,
  DUDA_ASKED,
  NICO_FOUND,
  NINA_FOUND,
  RUI_BLOCKED,
  THIAGO_ASKS,
  dmSent,
  friendsOverview,
} from '../../support/friends-fixtures';

describe('friends route ("Amigos")', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
  });

  function renderAt(path: string): ReturnType<typeof createMemoryRouter> {
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: [path] });
    render(<RouterProvider router={router} />);
    return router;
  }

  function biaOnlineCaioOffline(): void {
    deps.friends.getState().apply({
      kind: 'presenceSynced',
      friends: [{ userId: BIA.userId, status: 'online', table: null }],
    });
  }

  async function list(): Promise<HTMLElement> {
    return screen.findByRole('region', { name: 'Lista de amigos' });
  }

  async function openTab(name: RegExp | string): Promise<void> {
    await userEvent.click(await screen.findByRole('tab', { name }));
  }

  it('the rail has "Amigos", which opens the screen and is the current page', async () => {
    renderAt('/');
    const nav = await screen.findByRole('navigation', { name: 'Principal' });
    await userEvent.click(within(nav).getByRole('link', { name: /Amigos/ }));
    expect(await screen.findByRole('heading', { name: 'Amigos', level: 1 })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /Amigos/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('the badge of "Amigos" is received requests plus unread messages, gone at zero', async () => {
    deps.directMessages.getState().signIn(ANA.id);
    renderAt('/friends');
    const nav = await screen.findByRole('navigation', { name: 'Principal' });
    await waitFor(() =>
      expect(within(nav).getByRole('link', { name: /Amigos/ })).toHaveAccessibleName(
        'Amigos, 1 novidade',
      ),
    );
    deps.directMessages.getState().apply({ kind: 'sent', event: dmSent({ toUserId: ANA.id }) });
    await waitFor(() =>
      expect(within(nav).getByRole('link', { name: /Amigos/ })).toHaveAccessibleName(
        'Amigos, 2 novidades',
      ),
    );
    deps.friendsApi.lists = friendsOverview({ incoming: [] });
    await deps.friends.getState().load();
    deps.directMessages.getState().setActive(BIA.userId);
    await waitFor(() =>
      expect(within(nav).getByRole('link', { name: /Amigos/ })).toHaveAccessibleName('Amigos'),
    );
  });

  it('groups friends by status with the count; the Online tab leaves the offline out', async () => {
    renderAt('/friends');
    biaOnlineCaioOffline();
    const column = await list();
    expect(await within(column).findByRole('heading', { name: 'Online · 1' })).toBeInTheDocument();
    expect(within(column).getByRole('heading', { name: 'Offline · 1' })).toBeInTheDocument();
    expect(within(column).getByRole('link', { name: 'Conversar com Bia, online' })).toBeVisible();

    await openTab('Online');
    expect(within(column).queryByRole('link', { name: /Caio/ })).not.toBeInTheDocument();
    expect(within(column).getByRole('link', { name: /Bia/ })).toBeInTheDocument();
  });

  it('a friend at an open public table shows "Na mesa X"', async () => {
    renderAt('/friends');
    deps.friends.getState().apply({
      kind: 'presenceSynced',
      friends: [
        {
          userId: BIA.userId,
          status: 'online',
          table: { campaignId: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', name: 'Vharn' },
        },
      ],
    });
    expect(await screen.findByText('Na mesa Vharn')).toBeInTheDocument();
  });

  it('the search finds by nickname and by @; nobody found says so', async () => {
    renderAt('/friends');
    const column = await list();
    const search = await within(column).findByRole('searchbox', { name: 'Buscar amigo' });
    await userEvent.type(search, 'flor');
    expect(within(column).getByRole('link', { name: /Bia/ })).toBeInTheDocument();
    expect(within(column).queryByRole('link', { name: /Caio/ })).not.toBeInTheDocument();
    await userEvent.clear(search);
    await userEvent.type(search, 'x');
    expect(within(column).getByText('Ninguém com “x”.')).toBeInTheDocument();
  });

  it('no friend yet invites to add someone', async () => {
    deps.friendsApi.lists = friendsOverview({ friends: [] });
    renderAt('/friends');
    expect(await screen.findByText('Ainda sem amigos. Bora adicionar alguém?')).toBeInTheDocument();
  });

  it('while the first read runs, a skeleton; a failed read offers "Tentar de novo"', async () => {
    const answer = deps.friendsApi.answers.hold('overview');
    renderAt('/friends');
    expect(await screen.findByRole('list', { name: 'Carregando amigos' })).toBeInTheDocument();
    answer({ ok: false, failure: { kind: 'offline' } });
    const failure = (await screen.findByText('Não deu para carregar seus amigos.')).closest(
      '[role="alert"]',
    );
    if (!(failure instanceof HTMLElement)) throw new Error('the failure is not an alert');
    deps.friendsApi.answers.clear('overview');
    await userEvent.click(within(failure).getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('link', { name: /Bia/ })).toBeInTheDocument();
  });

  async function searchFor(typed: string): Promise<HTMLElement> {
    await userEvent.click(await screen.findByRole('button', { name: 'Adicionar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar amigo' });
    await userEvent.type(within(dialog).getByLabelText('Buscar pelo @usuário'), typed);
    return dialog;
  }

  it('"Adicionar" opens the search; one letter searches nothing yet', async () => {
    renderAt('/friends');
    const dialog = await searchFor('n');
    expect(within(dialog).getByText('Digite pelo menos 2 letras do @.')).toBeInTheDocument();
    expect(deps.friendsApi.answers.callsOf('search')).toEqual([]);
  });

  it('the search lists who it found and sends to each one chosen', async () => {
    deps.friendsApi.answers.answer('search', { ok: true, value: [NINA_FOUND, NICO_FOUND] });
    deps.friendsApi.answers.answer('sendRequest', { ok: true, value: 'sent' });
    renderAt('/friends');
    const dialog = await searchFor('@Ni');
    const found = await within(dialog).findByRole('list', { name: 'Pessoas encontradas' });
    await userEvent.click(within(found).getByRole('button', { name: 'Enviar pedido pra @nina' }));
    await userEvent.click(within(found).getByRole('button', { name: 'Enviar pedido pra @nico' }));
    expect(
      await within(found).findByRole('button', { name: 'Pedido enviado pra @nico' }),
    ).toBeDisabled();
    expect(within(found).getByRole('button', { name: 'Pedido enviado pra @nina' })).toBeDisabled();
    expect(deps.friendsApi.answers.callsOf('search')).toEqual(['ni']);
    expect(deps.friendsApi.answers.callsOf('sendRequest')).toEqual(['nina', 'nico']);
  });

  it('nobody found says so', async () => {
    renderAt('/friends');
    const dialog = await searchFor('zz');
    expect(
      await within(dialog).findByText('Ninguém com esse @ para adicionar.'),
    ).toBeInTheDocument();
  });

  it('a refused request says why on its row and keeps the button', async () => {
    deps.friendsApi.answers.answer('search', { ok: true, value: [NINA_FOUND] });
    deps.friendsApi.answers.answer('sendRequest', {
      ok: false,
      failure: { kind: 'outgoing_request_limit', limit: 50 },
    });
    renderAt('/friends');
    const dialog = await searchFor('ni');
    await userEvent.click(
      await within(dialog).findByRole('button', { name: 'Enviar pedido pra @nina' }),
    );
    expect(
      await within(dialog).findByText(
        'Você chegou ao teto de 50 pedidos enviados esperando resposta.',
      ),
    ).toHaveAttribute('role', 'alert');
    expect(within(dialog).getByRole('button', { name: 'Enviar pedido pra @nina' })).toBeEnabled();
  });

  it('"Pedidos" accepts, refuses and cancels requests', async () => {
    deps.friendsApi.answers.answer('acceptRequest', { ok: true, value: BIA });
    deps.friendsApi.answers.answer('dropRequest', { ok: true, value: null });
    renderAt('/friends');
    await openTab(/Pedidos \(1\)/);
    const thiago = await screen.findByRole('listitem', { name: THIAGO_ASKS.name });
    await userEvent.click(within(thiago).getByRole('button', { name: 'Aceitar' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Agora você e Thiago são amigos.');
    await userEvent.click(within(thiago).getByRole('button', { name: 'Recusar' }));
    const duda = screen.getByRole('listitem', { name: DUDA_ASKED.name });
    await userEvent.click(within(duda).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Pedido cancelado.'));
    expect(deps.friendsApi.answers.callsOf('acceptRequest')).toEqual([THIAGO_ASKS.userId]);
    expect(deps.friendsApi.answers.callsOf('dropRequest')).toEqual([
      THIAGO_ASKS.userId,
      DUDA_ASKED.userId,
    ]);
  });

  it('"Recusar e bloquear" asks first, then blocks who sent the request', async () => {
    deps.friendsApi.answers.answer('block', { ok: true, value: { ...THIAGO_ASKS } });
    renderAt('/friends');
    await openTab(/Pedidos/);
    const thiago = await screen.findByRole('listitem', { name: THIAGO_ASKS.name });
    await userEvent.click(within(thiago).getByRole('button', { name: 'Recusar e bloquear' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Bloquear Thiago?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Bloquear' }));
    await waitFor(() =>
      expect(deps.friendsApi.answers.callsOf('block')).toEqual([{ userId: THIAGO_ASKS.userId }]),
    );
  });

  it('"Bloqueados" unblocks and blocks by @', async () => {
    deps.friendsApi.answers.answer('unblock', { ok: true, value: null });
    deps.friendsApi.answers.answer('block', { ok: true, value: RUI_BLOCKED });
    renderAt('/friends');
    await openTab('Bloqueados');
    const rui = await screen.findByRole('listitem', { name: RUI_BLOCKED.name });
    await userEvent.click(within(rui).getByRole('button', { name: 'Desbloquear' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Rui foi desbloqueado.');
    await userEvent.type(screen.getByLabelText('Bloquear pelo @'), '@chato');
    await userEvent.click(screen.getByRole('button', { name: 'Bloquear' }));
    expect(deps.friendsApi.answers.callsOf('block')).toEqual([{ username: 'chato' }]);
    expect(deps.friendsApi.answers.callsOf('unblock')).toEqual([RUI_BLOCKED.userId]);
  });

  it('removing a friend goes through the confirmation and keeps the conversation', async () => {
    deps.friendsApi.answers.answer('removeFriend', { ok: true, value: null });
    deps.directMessages.getState().signIn(ANA.id);
    deps.directMessages.getState().apply({ kind: 'sent', event: dmSent({ toUserId: ANA.id }) });
    renderAt('/friends');
    await userEvent.click(await screen.findByRole('button', { name: 'Opções de Caio' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remover amigo' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Remover Caio dos amigos?' });
    expect(deps.friendsApi.answers.callsOf('removeFriend')).toEqual([]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remover' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Caio saiu dos seus amigos.');
    expect(deps.friendsApi.answers.callsOf('removeFriend')).toEqual([CAIO.userId]);
    expect(deps.directMessages.getState().conversations[BIA.userId]).toBeDefined();
  });

  it('blocking a friend goes through the confirmation and forgets the conversation', async () => {
    deps.friendsApi.answers.answer('block', { ok: true, value: { ...BIA, at: BIA.since } });
    deps.directMessages.getState().signIn(ANA.id);
    deps.directMessages.getState().apply({ kind: 'sent', event: dmSent({ toUserId: ANA.id }) });
    renderAt('/friends');
    await userEvent.click(await screen.findByRole('button', { name: 'Opções de Bia' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Bloquear' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Bloquear Bia?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Bloquear' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Bia foi bloqueado.');
    expect(deps.directMessages.getState().conversations[BIA.userId]).toBeUndefined();
  });

  it('no conversation chosen invites to pick someone', async () => {
    renderAt('/friends');
    expect(await screen.findByText('Escolhe alguém pra conversar')).toBeInTheDocument();
  });
});
