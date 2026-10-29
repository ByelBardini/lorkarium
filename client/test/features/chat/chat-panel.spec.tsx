import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ANA } from '../../support/auth-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import { chatMessageIdOf, chatSent, directBetween, trioGroup } from '../../support/chat-fixtures';
import {
  openVharnChat,
  receiveChat,
  renderChatPanel,
  vharnChat,
} from '../../support/chat-panel-harness';
import { biaRolled } from '../../support/dice-fixtures';
import { BIA_AT_TABLE, CAIO_AT_TABLE } from '../../support/table-session-fixtures';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';

const TABLE_CHANNEL = { kind: 'table', whisperTo: null } as const;

function feed(): HTMLElement {
  return screen.getByRole('log');
}

function field(): HTMLElement {
  return screen.getByRole('combobox', { name: 'Mensagem' });
}

function conversation(name: RegExp): HTMLElement {
  return within(screen.getByRole('navigation', { name: 'Conversas' })).getByRole('button', {
    name,
  });
}

describe('ChatPanel — feed and text', () => {
  let deps: TestDependencies;
  let user: UserEvent;

  beforeEach(() => {
    deps = testDependencies();
    user = userEvent.setup();
    openVharnChat(deps);
  });

  it('2026-10-28: closing the selected private by its context menu returns to Mesa; a new message reopens it unread', async () => {
    renderChatPanel(deps);
    const direct = directBetween(ANA.id, BIA_AT_TABLE.userId);
    receiveChat(deps, chatSent({ channel: direct, text: 'Conversa anterior.' }));
    await user.click(conversation(/^Bia/));
    fireEvent.contextMenu(conversation(/^Bia/));
    await user.click(screen.getByRole('menuitem', { name: 'Fechar conversa' }));
    expect(feed()).toHaveAccessibleName('Mensagens: Mesa');
    expect(
      within(screen.getByRole('navigation', { name: 'Conversas' })).queryByRole('button', {
        name: /^Bia/,
      }),
    ).toBeNull();
    receiveChat(
      deps,
      chatSent({ channel: direct, messageId: chatMessageIdOf(2), text: 'Mensagem nova.' }),
    );
    expect(conversation(/^Bia/)).toHaveAccessibleName('Bia, 1 não lida');
    expect(feed()).toHaveAccessibleName('Mensagens: Mesa');
    await user.click(conversation(/^Bia/));
    expect(feed()).toHaveTextContent('Mensagem nova.');
    expect(feed()).toHaveTextContent('Conversa anterior.');
    expect(deps.chat.sent).toEqual([]);
  });

  it('2026-10-28: a group can be closed without changing the selected Mesa, which has no close menu', async () => {
    renderChatPanel(deps);
    receiveChat(deps, chatSent({ channel: trioGroup() }));
    fireEvent.contextMenu(conversation(/^Os Três/));
    await user.click(screen.getByRole('menuitem', { name: 'Fechar conversa' }));
    expect(
      within(screen.getByRole('navigation', { name: 'Conversas' })).queryByRole('button', {
        name: /^Os Três/,
      }),
    ).toBeNull();
    expect(feed()).toHaveAccessibleName('Mensagens: Mesa');
    fireEvent.contextMenu(conversation(/^Mesa$/));
    expect(screen.queryByRole('menuitem', { name: 'Fechar conversa' })).toBeNull();
  });

  it('a conversation nobody spoke in says so, each one on its own', async () => {
    renderChatPanel(deps);
    expect(feed()).toHaveTextContent('Ninguém falou ainda nesta visita.');
    receiveChat(
      deps,
      chatSent({ channel: directBetween(ANA.id, BIA_AT_TABLE.userId), text: 'Psiu, Ana.' }),
    );
    expect(feed()).toHaveTextContent('Ninguém falou ainda nesta visita.');
    await user.click(conversation(/^Bia/));
    expect(feed()).toHaveTextContent('Psiu, Ana.');
    expect(feed()).not.toHaveTextContent('Ninguém falou ainda nesta visita.');
  });

  it('a message of the Table shows with its author and its text', () => {
    renderChatPanel(deps);
    receiveChat(deps, chatSent());
    expect(within(feed()).getByText('Bia')).toBeInTheDocument();
    expect(within(feed()).getByText('Oi, mesa.')).toBeInTheDocument();
  });

  it('Enter sends the text to the whole Table as oneself and empties the field', async () => {
    renderChatPanel(deps);
    await user.type(field(), 'Boa noite!{Enter}');
    expect(deps.chat.sent).toEqual([
      {
        campaignId: VHARN.id,
        request: { channel: TABLE_CHANNEL, speaker: { kind: 'self' }, text: 'Boa noite!' },
      },
    ]);
    expect(field()).toHaveValue('');
  });

  it('Shift+Enter breaks the line and sends nothing', async () => {
    renderChatPanel(deps);
    await user.type(field(), 'Linha 1{Shift>}{Enter}{/Shift}Linha 2');
    expect(field()).toHaveValue('Linha 1\nLinha 2');
    expect(deps.chat.sent).toEqual([]);
  });

  it('a refused message keeps the draft and says why', async () => {
    deps.chat.answer = { ok: false, failure: { kind: 'rate_limited', retryAfterSeconds: 3 } };
    renderChatPanel(deps);
    await user.type(field(), 'De novo{Enter}');
    expect(field()).toHaveValue('De novo');
    expect(screen.getByRole('alert')).toHaveTextContent('Muitas mensagens seguidas. Espere 3 s.');
  });

  it('while reconnecting the composer is disabled with a notice and the feed stays', () => {
    renderChatPanel(deps);
    receiveChat(deps, chatSent());
    deps.tableSessionApi.emitTo(VHARN.id, { kind: 'status', status: 'reconnecting' });
    expect(field()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    expect(screen.getByText(/Reconectando/)).toBeInTheDocument();
    expect(feed()).toHaveTextContent('Oi, mesa.');
  });

  it('a whisper to the viewer reads "sussurro pra você" in text', () => {
    renderChatPanel(deps);
    receiveChat(
      deps,
      chatSent({ channel: { kind: 'table', whisperTo: ANA.id }, text: 'Cuidado.' }),
    );
    const row = within(feed()).getByText('Cuidado.').closest('li');
    expect(row).toHaveTextContent('sussurro pra você');
  });

  it('a message calling the viewer by @ is marked as a mention; another one is not', () => {
    renderChatPanel(deps);
    receiveChat(
      deps,
      chatSent({ messageId: chatMessageIdOf(1), text: '@Ana, sua vez.' }),
      chatSent({ messageId: chatMessageIdOf(2), text: '@Caio, depois.' }),
    );
    const mention = within(feed()).getByText('@Ana, sua vez.').closest('li');
    const other = within(feed()).getByText('@Caio, depois.').closest('li');
    expect(mention).toHaveTextContent('Menciona você');
    expect(other).not.toHaveTextContent('Menciona você');
  });

  it('opening a conversation with unread messages zeroes them and shows "Novas" before them', async () => {
    renderChatPanel(deps);
    const direct = directBetween(ANA.id, BIA_AT_TABLE.userId);
    receiveChat(
      deps,
      chatSent({ messageId: chatMessageIdOf(1), channel: direct, text: 'Primeira.' }),
      chatSent({ messageId: chatMessageIdOf(2), channel: direct, text: 'Segunda.' }),
    );
    expect(conversation(/^Bia/)).toHaveAccessibleName('Bia, 2 não lidas');
    await user.click(conversation(/^Bia/));
    expect(conversation(/^Bia/)).toHaveAccessibleName('Bia');
    expect(
      vharnChat(deps)
        .getState()
        .conversations.find((each) => each.unread > 0),
    ).toBeUndefined();
    const items = within(feed()).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Novas'),
      expect.stringContaining('Primeira.'),
      expect.stringContaining('Segunda.'),
    ]);
  });

  it('the chat on screen marks its conversation as the active one, and leaving it clears it', () => {
    const { unmount } = renderChatPanel(deps);
    expect(vharnChat(deps).getState().activeKey).toBe('table');
    unmount();
    expect(vharnChat(deps).getState().activeKey).toBeNull();
  });

  it('the announcer says "Bia: text" for a message and nothing for a roll', () => {
    renderChatPanel(deps);
    const announcer = screen.getByTestId('chat-announcer');
    receiveChat(deps, chatSent());
    expect(announcer).toHaveTextContent('Bia: Oi, mesa.');
    deps.tableSessionApi.emitTo(VHARN.id, { kind: 'diceRolled', event: biaRolled() });
    expect(announcer).toHaveTextContent('Bia: Oi, mesa.');
    expect(announcer).not.toHaveTextContent(/rolou/);
  });

  it('the announcer leaves out one’s own message', async () => {
    renderChatPanel(deps);
    receiveChat(deps, chatSent({ fromUserId: ANA.id, text: 'Eu mesma.' }));
    expect(screen.getByTestId('chat-announcer')).toBeEmptyDOMElement();
  });

  it('the Table shows the rolls among the messages, and "Só conversa" leaves them out', async () => {
    renderChatPanel(deps);
    receiveChat(deps, chatSent());
    deps.tableSessionApi.emitTo(VHARN.id, { kind: 'diceRolled', event: biaRolled() });
    expect(within(feed()).getByText('Acerto')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Só conversa' }));
    expect(within(feed()).queryByText('Acerto')).toBeNull();
    expect(feed()).toHaveTextContent('Oi, mesa.');
  });
});

describe('ChatPanel — "Pra quem" and who is offline', () => {
  let deps: TestDependencies;
  let user: UserEvent;

  beforeEach(() => {
    deps = testDependencies();
    user = userEvent.setup();
    openVharnChat(deps);
  });

  it('"Sussurrar pra Caio" sends the text as a whisper to him', async () => {
    renderChatPanel(deps);
    await user.click(screen.getByRole('button', { name: /Pra quem/ }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Sussurrar pra Caio' }));
    await user.type(field(), 'Só você.{Enter}');
    expect(deps.chat.sent.at(-1)?.request.channel).toEqual({
      kind: 'table',
      whisperTo: CAIO_AT_TABLE.userId,
    });
  });

  it('a whisper to someone offline warns it would not arrive and cannot be sent', async () => {
    renderChatPanel(deps);
    await user.click(screen.getByRole('button', { name: /Pra quem/ }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Sussurrar pra Bia' }));
    await user.type(field(), 'Oi?{Enter}');
    expect(screen.getByText('Bia está offline: a mensagem não chegaria.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    expect(deps.chat.sent).toEqual([]);
  });

  it('a direct goes to that person, with no "Pra quem"', async () => {
    renderChatPanel(deps);
    act(() => {
      const key = vharnChat(deps).getState().startConversation({
        kind: 'direct',
        userId: CAIO_AT_TABLE.userId,
      });
      expect(key).toBe(`direct:${CAIO_AT_TABLE.userId}`);
    });
    await user.click(conversation(/^Caio/));
    await user.type(field(), 'Particular.{Enter}');
    expect(deps.chat.sent.at(-1)?.request.channel).toEqual({
      kind: 'direct',
      userId: CAIO_AT_TABLE.userId,
    });
    expect(screen.queryByRole('button', { name: /Pra quem/ })).toBeNull();
  });

  it('a direct with someone offline warns and cannot be sent', async () => {
    renderChatPanel(deps);
    act(() => {
      vharnChat(deps).getState().startConversation({ kind: 'direct', userId: BIA_AT_TABLE.userId });
    });
    await user.click(conversation(/^Bia/));
    await user.type(field(), 'Volta?{Enter}');
    expect(screen.getByText('Bia está offline: a mensagem não chegaria.')).toBeInTheDocument();
    expect(deps.chat.sent).toEqual([]);
  });
});

describe('ChatPanel — where the chat lives (the separate window)', () => {
  let deps: TestDependencies;
  let user: UserEvent;

  beforeEach(() => {
    deps = testDependencies();
    user = userEvent.setup();
    openVharnChat(deps);
  });

  it('docked, "Abrir em outra janela" asks for the window and the refusal shows', async () => {
    const opened: string[] = [];
    const open = () => void opened.push('open');
    renderChatPanel(deps, 'master', {
      window: { kind: 'docked', open, notice: 'O navegador bloqueou a janela.' },
    });
    await user.click(screen.getByRole('button', { name: 'Abrir em outra janela' }));
    expect(opened).toEqual(['open']);
    expect(screen.getByText('O navegador bloqueou a janela.')).toHaveAttribute('role', 'status');
    expect(feed()).toBeInTheDocument();
  });

  it('detached, the tab offers only "Trazer de volta" and leaves the active conversation alone', async () => {
    const asked: string[] = [];
    renderChatPanel(deps, 'master', {
      window: { kind: 'detached', bringBack: () => void asked.push('back') },
    });
    expect(screen.getByText('Chat aberto em outra janela')).toBeInTheDocument();
    expect(screen.queryByRole('log')).toBeNull();
    expect(vharnChat(deps).getState().activeKey).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Trazer de volta' }));
    expect(asked).toEqual(['back']);
  });
});
