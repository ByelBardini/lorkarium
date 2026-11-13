import { describe, expect, it } from 'vitest';
import { FriendProfileNoticeService } from '../../../src/modules/friends/friend-profile-notice.service';
import { FriendIdsFake } from '../../support/account-presence-fakes';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID } from '../../support/campaigns-factories';
import { FriendsChangedFake } from '../../support/friends-fakes';

const NOW = new Date('2026-11-12T12:00:00Z');

function noticeWith(friends: Record<string, string[]>): {
  changed: FriendsChangedFake;
  notice: FriendProfileNoticeService;
} {
  const changed = new FriendsChangedFake();
  const friendships = new FriendIdsFake(friends);
  const notice = new FriendProfileNoticeService({
    friendships,
    changed,
    clock: new ClockFake(NOW),
  });
  return { changed, notice };
}

describe('FriendProfileNoticeService', () => {
  it('Bia saved her profile: Ana and Caio (her friends) read their lists again', async () => {
    const { changed, notice } = noticeWith({ [BIA_ID]: [ANA_ID, CAIO_ID] });

    await notice.profileChanged(BIA_ID);

    expect(changed.changes).toEqual([{ userIds: [ANA_ID, CAIO_ID], at: NOW }]);
  });

  it('nobody to tell: no friends:changed at all', async () => {
    const { changed, notice } = noticeWith({});

    await notice.profileChanged(BIA_ID);

    expect(changed.changes).toEqual([]);
  });
});
