import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FriendRow } from '@/features/friends/friend-row';
import { BIA } from '../../support/friends-fixtures';
import { ProfileCardHarness } from '../../support/profile-card-harness';
import { lyraCard } from '../../support/profile-card-fixtures';

describe('FriendRow', () => {
  it('the profile button beside the conversation link opens the friend profile card', async () => {
    const harness = new ProfileCardHarness();
    harness.deps.profileCardApi.put(
      lyraCard({ id: BIA.userId, name: BIA.name, username: 'biaflor' }),
    );
    harness.mount(
      <ul>
        <FriendRow
          friend={BIA}
          presence={{ status: 'online', table: null }}
          unread={0}
          selected={false}
          deps={harness.deps}
          onNotice={() => undefined}
        />
      </ul>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Perfil de Bia' }));

    expect(await screen.findByRole('dialog', { name: 'Perfil de Bia' })).toBeInTheDocument();
    expect(await screen.findByText('@biaflor')).toBeInTheDocument();
  });
});
