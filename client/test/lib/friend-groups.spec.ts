import type { PresenceStatusDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { friendGroupsOf, matchesFriendQuery } from '@/lib/friend-groups';
import { BIA, CAIO } from '../support/friends-fixtures';

const ANDRE = {
  ...CAIO,
  userId: '1b2c3d4e-5f60-4a71-8b82-9c93d4e5f699',
  name: 'André',
  username: 'dede',
};

function statuses(map: Record<string, PresenceStatusDto>): (id: string) => PresenceStatusDto {
  return (id) => map[id] ?? 'offline';
}

describe('friendGroupsOf', () => {
  it('groups by Online, Ausente, Offline, each by name, leaving empty groups out', () => {
    const groups = friendGroupsOf(
      [CAIO, BIA, ANDRE],
      statuses({ [CAIO.userId]: 'online', [ANDRE.userId]: 'online' }),
      {
        onlineOnly: false,
        query: '',
      },
    );
    expect(groups.map((group) => [group.label, group.friends.map((f) => f.name)])).toEqual([
      ['Online', ['André', 'Caio']],
      ['Offline', ['Bia']],
    ]);
  });

  it('the Online tab keeps online and away, never offline', () => {
    const groups = friendGroupsOf(
      [BIA, CAIO, ANDRE],
      statuses({ [BIA.userId]: 'away', [CAIO.userId]: 'online' }),
      {
        onlineOnly: true,
        query: '',
      },
    );
    expect(groups.map((group) => group.status)).toEqual(['online', 'away']);
  });

  it('the search keeps only who matches', () => {
    const groups = friendGroupsOf([BIA, CAIO], statuses({}), { onlineOnly: false, query: 'bia' });
    expect(groups[0]?.friends).toEqual([BIA]);
  });
});

describe('matchesFriendQuery', () => {
  it('finds by a piece of the nickname or of the @, without accent, case or a typed "@"', () => {
    expect(matchesFriendQuery(ANDRE, 'andre')).toBe(true);
    expect(matchesFriendQuery(BIA, '@FLOR')).toBe(true);
    expect(matchesFriendQuery(BIA, 'caio')).toBe(false);
  });

  it('an empty search matches everyone', () => {
    expect(matchesFriendQuery(BIA, '  ')).toBe(true);
  });
});
