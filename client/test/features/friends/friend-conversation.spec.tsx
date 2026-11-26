import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { BIA, dmSent, friendsOverview } from '../../support/friends-fixtures';

const BIA_PATH = `/friends/${BIA.userId}`;

function at(day: number, hour: number, minute: number): string {
  return new Date(2026, 9, day, hour, minute).toISOString();
}

describe('friend conversation', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
    deps.directMessages.getState().signIn(ANA.id);
    deps.accountRealtime.start();
    deps.accountTransport.lifecycle({ kind: 'connected' });
    setBia('online');
  });

  function setBia(status: 'online' | 'away' | 'offline'): void {
    deps.friends.getState().apply({
      kind: 'presenceSynced',
      friends: [{ userId: BIA.userId, status, table: null }],
    });
  }

  function receive(changes: Parameters<typeof dmSent>[0] = {}): void {
    deps.directMessages.getState().apply({
      kind: 'sent',
      event: dmSent({ toUserId: ANA.id, ...changes }),
    });
  }

  function renderAt(path: string): ReturnType<typeof createMemoryRouter> {
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: [path] });
    render(<RouterProvider router={router} />);
    return router;
  }

  async function field(): Promise<HTMLElement> {
    return screen.findByRole('combobox', { name: 'Mensagem para Bia' });
  }

  it('Enter sends the message; Shift+Enter breaks the line', async () => {
    renderAt(BIA_PATH);
    const input = await field();
    await userEvent.type(input, 'oi{Shift>}{Enter}{/Shift}tudo bem?');
    expect(input).toHaveValue('oi\ntudo bem?');
    await userEvent.type(input, '{Enter}');
    expect(deps.directMessageCommands.sent).toEqual([
      { toUserId: BIA.userId, text: 'oi\ntudo bem?', replyToMessageId: null },
    ]);
    expect(input).toHaveValue('');
  });

  it('typing tells the friend', async () => {
    renderAt(BIA_PATH);
    await userEvent.type(await field(), 'o');
    expect(deps.directMessageCommands.typings).toEqual([BIA.userId]);
  });

  it('":" lists the memes and smileys, and "Memes e smileys" writes a code', async () => {
    renderAt(BIA_PATH);
    const input = await field();
    await userEvent.type(input, 'kkk :hueh');
    const list = screen.getByRole('listbox', { name: 'Sugestões' });
    expect(within(list).getByRole('option')).toHaveAttribute('data-value', ':huehue:');
    await userEvent.keyboard('{Enter}');
    expect(input).toHaveValue('kkk :huehue: ');
    expect(deps.directMessageCommands.sent).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Memes e smileys' }));
    await userEvent.click(screen.getByRole('button', { name: '=)' }));
    expect(input).toHaveValue('kkk :huehue: =) ');
  });

  it('a meme or smiley code in a message is drawn as its picture', async () => {
    receive({ text: 'bora :doge: <3' });
    renderAt(BIA_PATH);
    expect(await screen.findByRole('img', { name: ':doge:' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '<3' })).toBeInTheDocument();
  });

  it('messages are grouped by author with the time at the end, under a day separator', async () => {
    receive({ at: at(14, 19, 0), text: 'oi' });
    receive({ at: at(14, 19, 1), text: 'bora jogar?' });
    receive({ at: at(14, 19, 2), text: 'bora', fromUserId: ANA.id, toUserId: BIA.userId });
    renderAt(BIA_PATH);
    const today = await screen.findByRole('region', { name: 'Hoje' });
    expect(within(today).getByRole('separator')).toHaveTextContent('Hoje');
    expect(
      within(today)
        .getAllByRole('time')
        .map((time) => time.textContent),
    ).toEqual(['19:01', '19:02']);
    expect(within(today).getByText('oi')).toBeInTheDocument();
  });

  it('"Bia está digitando…" shows and goes away after 4 s', async () => {
    renderAt(BIA_PATH);
    await field();
    deps.directMessages.getState().apply({
      kind: 'typingFrom',
      event: { fromUserId: BIA.userId, at: at(14, 20, 0) },
    });
    expect(await screen.findByText('Bia está digitando…')).toBeInTheDocument();
    deps.interactionClock.advance(4000);
    await waitFor(() => expect(screen.queryByText('Bia está digitando…')).not.toBeInTheDocument());
  });

  it('an offline friend turns the field off with why', async () => {
    setBia('offline');
    renderAt(BIA_PATH);
    expect(await field()).toBeDisabled();
    expect(
      screen.getByText('Bia está offline. Mensagens só chegam a quem está online.'),
    ).toBeInTheDocument();
  });

  it('invisible, the field is off and asks to be online', async () => {
    deps.presenceChoice.getState().choose('invisible');
    renderAt(BIA_PATH);
    expect(await field()).toBeDisabled();
    expect(
      screen.getByText('Você está invisível. Fique online para conversar.'),
    ).toBeInTheDocument();
  });

  it('with the connection down, "Reconectando…" and no sending', async () => {
    renderAt(BIA_PATH);
    await field();
    deps.accountTransport.lifecycle({ kind: 'disconnected', willRetry: true });
    expect(await screen.findByText('Reconectando…')).toHaveAttribute('role', 'status');
    expect(await field()).toBeDisabled();
  });

  it('a refusal of the server goes under the field and gives the text back', async () => {
    deps.directMessageCommands.answer = { ok: false, failure: { kind: 'recipient_offline' } };
    renderAt(BIA_PATH);
    const input = await field();
    await userEvent.type(input, 'oi{Enter}');
    expect(
      await screen.findByText('Bia está offline. Mensagens só chegam a quem está online.'),
    ).toHaveAttribute('role', 'alert');
    expect(input).toHaveValue('oi');
  });

  it('below md, the conversation alone with "Voltar" to the list', async () => {
    renderAt(BIA_PATH);
    await field();
    expect(screen.getByRole('region', { name: 'Lista de amigos' })).toHaveClass('hidden');
    await userEvent.click(screen.getByRole('link', { name: 'Voltar' }));
    expect(await screen.findByText('Escolhe alguém pra conversar')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Lista de amigos' })).not.toHaveClass('hidden');
  });

  it('opening the conversation reads its messages', async () => {
    receive();
    renderAt(BIA_PATH);
    await field();
    expect(deps.directMessages.getState().conversations[BIA.userId]?.unread).toBe(0);
  });

  it('a friend removed while open sends the screen back to the list', async () => {
    const router = renderAt(BIA_PATH);
    await field();
    deps.friendsApi.lists = friendsOverview({ friends: [] });
    await deps.friends.getState().load();
    await waitFor(() => expect(router.state.location.pathname).toBe('/friends'));
  });

  describe('answering a message', () => {
    const QUOTED_ID = '2c3d4e5f-6071-4a82-8b93-ffffffffffff';

    it('"Responder" shows who is answered and sends the quoted id; Esc cancels', async () => {
      receive({ messageId: QUOTED_ID, text: 'Bora jogar?' });
      renderAt(BIA_PATH);
      const input = await field();

      await userEvent.click(screen.getByRole('button', { name: 'Responder Bia' }));
      expect(screen.getByText(/Respondendo a/)).toHaveTextContent('Respondendo a Bia');
      expect(screen.queryByRole('button', { name: 'Mencionar Bia' })).toBeNull();
      expect(input).toHaveFocus();
      await userEvent.type(input, 'Bora!{Enter}');

      expect(deps.directMessageCommands.sent.at(-1)).toEqual({
        toUserId: BIA.userId,
        text: 'Bora!',
        replyToMessageId: QUOTED_ID,
      });
      expect(screen.queryByText(/Respondendo a/)).toBeNull();

      await userEvent.click(screen.getByRole('button', { name: 'Responder Bia' }));
      await userEvent.keyboard('{Escape}');
      expect(screen.queryByText(/Respondendo a/)).toBeNull();
    });

    it('a double click on a message answers it', async () => {
      receive({ messageId: QUOTED_ID, text: 'Bora jogar?' });
      renderAt(BIA_PATH);
      const input = await field();

      await userEvent.dblClick(screen.getByText('Bora jogar?'));

      expect(screen.getByText(/Respondendo a/)).toHaveTextContent('Respondendo a Bia');
      expect(input).toHaveFocus();
    });

    it('a reply quotes its original, and one this device lost shows as unavailable', async () => {
      receive({ messageId: QUOTED_ID, text: 'Bora jogar?' });
      receive({ text: 'Respondendo eu mesma', replyToMessageId: QUOTED_ID });
      receive({ text: 'Lembra?', replyToMessageId: '2c3d4e5f-6071-4a82-8b93-eeeeeeeeeeee' });
      renderAt(BIA_PATH);

      const quote = await screen.findByRole('button', {
        name: 'Ir para a mensagem de Bia: Bora jogar?',
      });
      await userEvent.click(quote);

      expect(document.querySelector(`[data-message-id="${QUOTED_ID}"]`)).toHaveAttribute(
        'data-flash',
      );
      expect(screen.getByText('Mensagem original indisponível')).toBeInTheDocument();
    });
  });
});
