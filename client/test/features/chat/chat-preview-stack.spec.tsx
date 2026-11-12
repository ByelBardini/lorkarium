import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ChatPreviewStack } from '@/features/chat/chat-preview-stack';
import type { ChatNoticeItem } from '@/features/chat/use-chat-notices';
import type { ChatSentDto } from '@lorkarium/contracts';
import {
  conversationKeyOf,
  conversationTargetOf,
  type ChatConversationKey,
} from '@/lib/chat-conversations';
import { chatMessageIdOf, chatSent, directBetween } from '../../support/chat-fixtures';
import { BIA_AT_TABLE, CAIO_AT_TABLE } from '../../support/table-session-fixtures';

const BIA = BIA_AT_TABLE.userId;
const CAIO = CAIO_AT_TABLE.userId;

const NAMES: Readonly<Record<string, string>> = {
  [BIA]: 'Bia',
  [CAIO]: 'Caio',
};

function nameOf(userId: string): string {
  return NAMES[userId] ?? 'Alguém';
}

function previewOf(n: number, text: string, overrides: Partial<ChatSentDto> = {}): ChatNoticeItem {
  const event = chatSent({ messageId: chatMessageIdOf(n), fromUserId: CAIO, text, ...overrides });
  const target = conversationTargetOf(event.channel, BIA);
  if (target === null) throw new Error(`${JSON.stringify(event.channel)} is not Bia's`);
  return {
    id: event.messageId,
    key: conversationKeyOf(target),
    message: { event, receivedAtMs: n },
  };
}

/** The conversations "opened" by the previews, in order. */
class OpenedConversations {
  readonly keys: ChatConversationKey[] = [];
  readonly open = (key: ChatConversationKey): void => void this.keys.push(key);
}

describe('ChatPreviewStack', () => {
  it('draws nothing without a preview', () => {
    const { container } = render(
      <ChatPreviewStack previews={[]} nameOf={nameOf} onOpen={() => undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists the previews oldest on top, silent for the screen reader', () => {
    const previews = [previewOf(1, 'Vou abrir'), previewOf(2, 'Cuidado', { fromUserId: BIA })];
    render(<ChatPreviewStack previews={previews} nameOf={nameOf} onOpen={() => undefined} />);
    const list = screen.getByRole('list', { name: 'Mensagens novas' });
    expect(list).toHaveAttribute('aria-live', 'off');
    const names = within(list)
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(names).toEqual(['Caio: Vou abrir', 'Bia: Cuidado']);
  });

  it('clicking a preview opens its conversation', async () => {
    const opened = new OpenedConversations();
    const direct = previewOf(1, 'Psiu', { channel: directBetween(BIA, CAIO) });
    render(<ChatPreviewStack previews={[direct]} nameOf={nameOf} onOpen={opened.open} />);
    await userEvent.click(screen.getByRole('button', { name: 'Caio, no privado: Psiu' }));
    expect(opened.keys).toEqual([`direct:${CAIO}`]);
  });
});
