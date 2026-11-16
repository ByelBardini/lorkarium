import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ChatMessageRow } from '@/features/chat/chat-message-row';
import type { ChatPeople } from '@/features/chat/use-chat-people';
import { chatSent } from '../../support/chat-fixtures';
import { ProfileCardHarness } from '../../support/profile-card-harness';
import { lyraCard } from '../../support/profile-card-fixtures';
import { BIA_AT_TABLE } from '../../support/table-session-fixtures';

const PEOPLE: ChatPeople = {
  viewerId: 'someone-else',
  members: [BIA_AT_TABLE],
  identityOf: () => ({ name: 'Bia', color: 'steel', avatarId: null }),
  nameOf: () => 'Bia',
  memberOf: () => BIA_AT_TABLE,
};

describe('ChatMessageRow', () => {
  it('the author name of a message opens the author profile card', async () => {
    const harness = new ProfileCardHarness();
    harness.deps.profileCardApi.put(
      lyraCard({ id: BIA_AT_TABLE.userId, name: 'Bia', username: 'bia' }),
    );
    const message = { event: chatSent(), receivedAtMs: 0 };
    harness.mount(
      <ul>
        <ChatMessageRow
          message={message}
          continued={false}
          people={PEOPLE}
          viewerNames={[]}
          face={null}
          quoted={null}
          onReply={() => undefined}
        />
      </ul>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Bia' }));

    expect(await screen.findByRole('dialog', { name: 'Perfil de Bia' })).toBeInTheDocument();
    expect(await screen.findByText('@bia')).toBeInTheDocument();
  });
});
