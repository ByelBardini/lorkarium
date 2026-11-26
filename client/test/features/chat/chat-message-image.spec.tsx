import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ChatMessageRow } from '@/features/chat/chat-message-row';
import type { ChatPeople } from '@/features/chat/use-chat-people';
import { chatSent } from '../../support/chat-fixtures';
import { BIA_AT_TABLE } from '../../support/table-session-fixtures';

const IMAGE = { assetId: '6d7e8f9a-0b1c-4d2e-8f3a-4b5c6d7e8f9a', width: 800, height: 600 };
const PEOPLE: ChatPeople = {
  viewerId: 'someone-else',
  members: [BIA_AT_TABLE],
  identityOf: () => ({ name: 'Bia', color: 'steel', avatarId: null }),
  nameOf: () => 'Bia',
  memberOf: () => BIA_AT_TABLE,
};

function renderRow(text: string, onReply: () => void = () => undefined): void {
  const message = { event: chatSent({ text, image: IMAGE }), receivedAtMs: 0 };
  render(
    <ul>
      <ChatMessageRow
        message={message}
        continued={false}
        people={PEOPLE}
        viewerNames={[]}
        face={null}
        quoted={null}
        onReply={onReply}
      />
    </ul>,
  );
}

describe('ChatMessageImage, in a message row', () => {
  it('reserves the size of the event and is named after who sent it', () => {
    renderRow('olha');

    const picture = screen.getByRole('img', { name: 'Imagem de Bia' });
    expect(picture).toHaveAttribute('width', '800');
    expect(picture).toHaveAttribute('height', '600');
    expect(picture).toHaveAttribute('src', `/api/assets/${IMAGE.assetId}`);
    expect(picture).toHaveAttribute('loading', 'lazy');
    expect(screen.getByText('olha')).toBeInTheDocument();
  });

  it('a click opens it full screen', async () => {
    renderRow('');

    await userEvent.click(
      screen.getByRole('button', { name: 'Abrir imagem de bia em tela cheia' }),
    );

    expect(screen.getByRole('dialog', { name: 'Imagem de Bia' })).toBeInTheDocument();
  });

  it('a double click answers on the text, but not on the picture, which keeps opening', async () => {
    let answers = 0;
    renderRow('olha', () => (answers += 1));

    await userEvent.dblClick(screen.getByText('olha'));
    expect(answers).toBe(1);
    await userEvent.dblClick(screen.getByRole('img', { name: 'Imagem de Bia' }));
    expect(answers).toBe(1);
  });

  it('a picture the server swept becomes "Imagem expirada", with nothing to open', () => {
    renderRow('');

    fireEvent.error(screen.getByRole('img', { name: 'Imagem de Bia' }));

    expect(screen.getByText('Imagem expirada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tela cheia/ })).toBeNull();
  });

  it('a message with only the picture draws no empty text', () => {
    renderRow('');

    const row = screen.getByRole('listitem');
    expect(row.querySelectorAll('p.whitespace-pre-wrap')).toHaveLength(0);
  });
});
