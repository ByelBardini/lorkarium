import { screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ANA } from '../../support/auth-api-fake';
import { CHAT_MESSAGE_ID, chatMessageIdOf, chatSent } from '../../support/chat-fixtures';
import { openVharnChat, receiveChat, renderChatPanel } from '../../support/chat-panel-harness';
import { BIA_AT_TABLE, CAIO_AT_TABLE } from '../../support/table-session-fixtures';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';

const REPLY_ID = chatMessageIdOf(2);

function feed(): HTMLElement {
  return screen.getByRole('log', { name: /^Mensagens/ });
}

function field(): HTMLElement {
  return screen.getByRole('combobox', { name: 'Mensagem' });
}

function rowOf(messageId: string): HTMLElement {
  const row = feed().querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
  if (!row) throw new Error(`no row for message ${messageId}; expected one in the feed`);
  return row;
}

describe('ChatPanel — answering a message', () => {
  let deps: TestDependencies;
  let user: UserEvent;

  beforeEach(() => {
    deps = testDependencies();
    user = userEvent.setup();
    openVharnChat(deps);
    renderChatPanel(deps);
    receiveChat(deps, chatSent());
  });

  it('"Responder" shows who is answered and sends the quoted id calling its author', async () => {
    await user.click(screen.getByRole('button', { name: 'Responder Bia' }));
    expect(screen.getByText(/Respondendo a/)).toHaveTextContent('Respondendo a Bia');
    expect(field()).toHaveFocus();

    await user.type(field(), 'Abrindo.{Enter}');

    expect(deps.chat.sent.at(-1)?.request).toMatchObject({
      channel: { kind: 'table', whisperTo: null },
      text: 'Abrindo.',
      replyTo: { messageId: CHAT_MESSAGE_ID, mentionUserId: BIA_AT_TABLE.userId },
    });
    expect(screen.queryByText(/Respondendo a/)).toBeNull();
  });

  it('turning the @ off answers without calling the author', async () => {
    await user.click(screen.getByRole('button', { name: 'Responder Bia' }));
    const mention = screen.getByRole('button', { name: 'Mencionar Bia' });
    expect(mention).toHaveAttribute('aria-pressed', 'true');

    await user.click(mention);
    await user.type(field(), 'Ok.{Enter}');

    expect(deps.chat.sent.at(-1)?.request.replyTo).toEqual({
      messageId: CHAT_MESSAGE_ID,
      mentionUserId: null,
    });
  });

  it('Esc and the X cancel the answer; the next message quotes nothing', async () => {
    await user.click(screen.getByRole('button', { name: 'Responder Bia' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByText(/Respondendo a/)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Responder Bia' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar resposta' }));
    await user.type(field(), 'Solto.{Enter}');

    expect(deps.chat.sent.at(-1)?.request.replyTo).toBeNull();
  });

  it('a whisper is answered in the same whisper, with "Pra quem" locked', async () => {
    const whisper = chatSent({
      messageId: REPLY_ID,
      fromUserId: CAIO_AT_TABLE.userId,
      channel: { kind: 'table', whisperTo: ANA.id },
      text: 'Só entre nós.',
    });
    receiveChat(deps, whisper);

    await user.click(screen.getByRole('button', { name: 'Responder Caio' }));
    expect(screen.getByRole('button', { name: /Pra quem/ })).toBeDisabled();
    await user.type(field(), 'Combinado.{Enter}');

    expect(deps.chat.sent.at(-1)?.request.channel).toEqual({
      kind: 'table',
      whisperTo: CAIO_AT_TABLE.userId,
    });
  });

  it('a reply quotes the original above its text, and clicking it makes the original blink', async () => {
    const reply = { messageId: CHAT_MESSAGE_ID, mentionUserId: null };
    receiveChat(deps, chatSent({ messageId: REPLY_ID, text: 'Eu de novo.', replyTo: reply }));

    const quote = within(rowOf(REPLY_ID)).getByRole('button', {
      name: 'Ir para a mensagem de Bia: Oi, mesa.',
    });
    await user.click(quote);

    expect(rowOf(CHAT_MESSAGE_ID)).toHaveAttribute('data-flash');
  });

  it('an original this visit never saw shows as unavailable', () => {
    const lost = { messageId: chatMessageIdOf(40), mentionUserId: null };
    receiveChat(deps, chatSent({ messageId: REPLY_ID, text: 'Como eu disse.', replyTo: lost }));

    expect(rowOf(REPLY_ID)).toHaveTextContent('Mensagem original indisponível');
  });

  it('a reply that calls the viewer is marked as a mention of them', () => {
    const callsAna = { messageId: CHAT_MESSAGE_ID, mentionUserId: ANA.id };
    receiveChat(deps, chatSent({ messageId: REPLY_ID, text: 'Concordo.', replyTo: callsAna }));

    expect(rowOf(REPLY_ID)).toHaveTextContent('Menciona você');
    expect(rowOf(CHAT_MESSAGE_ID)).not.toHaveTextContent('Menciona você');
  });
});
