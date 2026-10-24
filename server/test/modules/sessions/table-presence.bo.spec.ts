import { describe, expect, it } from 'vitest';
import { EMPTY_ROSTER, TablePresenceBo } from '../../../src/modules/sessions/table-presence.bo';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, DUDA_ID } from '../../support/campaigns-factories';
import { presenceRoster } from '../../support/sessions-factories';

const AT = new Date('2026-10-22T21:00:00Z');
const LATER = new Date('2026-10-22T21:10:00Z');

describe('TablePresenceBo.connect', () => {
  it('the first socket of a user on an empty roster brings them online and bumps the version', () => {
    const outcome = new TablePresenceBo(EMPTY_ROSTER).connect(ANA_ID, 's1');
    expect(outcome.change).toBe('came-online');
    expect(outcome.roster).toEqual(presenceRoster({ version: 1, sockets: { [ANA_ID]: ['s1'] } }));
  });

  it('a second tab of an online user is already-online and keeps the version', () => {
    const roster = presenceRoster({ version: 1, sockets: { [ANA_ID]: ['s1'] } });
    const outcome = new TablePresenceBo(roster).connect(ANA_ID, 's2');
    expect(outcome.change).toBe('already-online');
    expect(outcome.roster).toEqual(
      presenceRoster({ version: 1, sockets: { [ANA_ID]: ['s1', 's2'] } }),
    );
  });

  it('a user reconnecting inside the grace period returns without bumping the version', () => {
    const roster = presenceRoster({ version: 1, inGrace: [ANA_ID] });
    const outcome = new TablePresenceBo(roster).connect(ANA_ID, 's2');
    expect(outcome.change).toBe('returned-in-grace');
    expect(outcome.roster).toEqual(presenceRoster({ version: 1, sockets: { [ANA_ID]: ['s2'] } }));
  });
});

describe('TablePresenceBo.disconnect', () => {
  it('closing one of two tabs keeps the user still-online with the same version', () => {
    const roster = presenceRoster({ version: 1, sockets: { [ANA_ID]: ['s1', 's2'] } });
    const outcome = new TablePresenceBo(roster).disconnect(ANA_ID, 's1', 'left', AT);
    expect(outcome.change).toBe('still-online');
    expect(outcome.roster).toEqual(presenceRoster({ version: 1, sockets: { [ANA_ID]: ['s2'] } }));
  });

  it('leaving from the last socket takes the user offline at once and bumps the version', () => {
    const roster = presenceRoster({ version: 1, sockets: { [ANA_ID]: ['s1'] } });
    const outcome = new TablePresenceBo(roster).disconnect(ANA_ID, 's1', 'left', AT);
    expect(outcome.change).toBe('went-offline');
    expect(outcome.roster).toEqual(presenceRoster({ version: 2 }));
  });

  it('dropping the last socket starts the grace period: still online, same version', () => {
    const roster = presenceRoster({ version: 1, sockets: { [ANA_ID]: ['s1'] } });
    const outcome = new TablePresenceBo(roster).disconnect(ANA_ID, 's1', 'dropped', AT);
    expect(outcome.change).toBe('grace-started');
    expect(outcome.roster).toEqual(presenceRoster({ version: 1, inGrace: [ANA_ID] }));
    expect(new TablePresenceBo(outcome.roster).isOnline(ANA_ID)).toBe(true);
  });

  it('disconnecting a socket the user does not hold is not-connected and changes nothing', () => {
    const roster = presenceRoster({ version: 1, sockets: { [ANA_ID]: ['s1'] } });
    const outcome = new TablePresenceBo(roster).disconnect(ANA_ID, 's9', 'left', AT);
    expect(outcome.change).toBe('not-connected');
    expect(outcome.roster).toEqual(roster);
  });
});

describe('TablePresenceBo.expireGrace', () => {
  it('a grace period ending without return takes the user offline and bumps the version', () => {
    const roster = presenceRoster({ version: 1, inGrace: [ANA_ID] });
    const outcome = new TablePresenceBo(roster).expireGrace(ANA_ID);
    expect(outcome.change).toBe('went-offline');
    expect(outcome.roster).toEqual(presenceRoster({ version: 2 }));
    expect(new TablePresenceBo(outcome.roster).isOnline(ANA_ID)).toBe(false);
  });

  it('a grace period ending after the user came back is already-back and changes nothing', () => {
    const roster = presenceRoster({ version: 1, sockets: { [ANA_ID]: ['s2'] } });
    const outcome = new TablePresenceBo(roster).expireGrace(ANA_ID);
    expect(outcome.change).toBe('already-back');
    expect(outcome.roster).toEqual(roster);
  });

  it('a grace period ending for a user who is not at the table is not-connected', () => {
    const outcome = new TablePresenceBo(EMPTY_ROSTER).expireGrace(ANA_ID);
    expect(outcome.change).toBe('not-connected');
    expect(outcome.roster).toEqual(EMPTY_ROSTER);
  });
});

describe('TablePresenceBo across users', () => {
  it('Bia leaving does not touch Ana, who stays online with her sockets', () => {
    const roster = presenceRoster({
      version: 2,
      sockets: { [ANA_ID]: ['s1'], [BIA_ID]: ['s2'] },
    });
    const outcome = new TablePresenceBo(roster).disconnect(BIA_ID, 's2', 'left', AT);
    expect(outcome.roster).toEqual(presenceRoster({ version: 3, sockets: { [ANA_ID]: ['s1'] } }));
  });

  it('Bia dropping a socket id that Ana holds does not disconnect Ana', () => {
    const roster = presenceRoster({ version: 1, sockets: { [ANA_ID]: ['s1'] } });
    const outcome = new TablePresenceBo(roster).disconnect(BIA_ID, 's1', 'dropped', AT);
    expect(outcome.change).toBe('not-connected');
    expect(outcome.roster).toEqual(roster);
  });

  it('the roster given to the rule is never mutated by any operation', () => {
    const roster = presenceRoster({ version: 1, sockets: { [ANA_ID]: ['s1'] }, inGrace: [BIA_ID] });
    const presence = new TablePresenceBo(roster);
    presence.connect(ANA_ID, 's2');
    presence.connect(BIA_ID, 's3');
    presence.disconnect(ANA_ID, 's1', 'dropped', AT);
    presence.expireGrace(BIA_ID);
    expect(roster).toEqual(
      presenceRoster({ version: 1, sockets: { [ANA_ID]: ['s1'] }, inGrace: [BIA_ID] }),
    );
  });
});

describe('TablePresenceBo, away', () => {
  it('the only socket of Ana standing still makes her went-away since then, bumping the version', () => {
    const roster = presenceRoster({ version: 1, sockets: { [ANA_ID]: ['s1'] } });

    const outcome = new TablePresenceBo(roster).markAway(ANA_ID, 's1', AT);

    expect(outcome.change).toBe('went-away');
    expect(outcome.roster.version).toBe(2);
    expect(new TablePresenceBo(outcome.roster).awaySinceOf(ANA_ID)).toEqual(AT);
  });

  it('Ana away moving again is came-back, bumping the version', () => {
    const roster = presenceRoster({
      version: 2,
      sockets: { [ANA_ID]: ['s1'] },
      away: ['s1'],
      awaySince: { [ANA_ID]: AT },
    });

    const outcome = new TablePresenceBo(roster).markActive(ANA_ID, 's1');

    expect(outcome.change).toBe('came-back');
    expect(outcome.roster).toEqual(presenceRoster({ version: 3, sockets: { [ANA_ID]: ['s1'] } }));
  });

  it('one of two tabs standing still is still-active, without a version', () => {
    const roster = presenceRoster({ version: 1, sockets: { [ANA_ID]: ['s1', 's2'] } });

    const outcome = new TablePresenceBo(roster).markAway(ANA_ID, 's1', AT);

    expect(outcome.change).toBe('still-active');
    expect(outcome.roster.version).toBe(1);
    expect(new TablePresenceBo(outcome.roster).awaySinceOf(ANA_ID)).toBeNull();
  });

  it('the second tab standing still too makes her went-away', () => {
    const roster = presenceRoster({
      version: 1,
      sockets: { [ANA_ID]: ['s1', 's2'] },
      away: ['s1'],
    });

    const outcome = new TablePresenceBo(roster).markAway(ANA_ID, 's2', LATER);

    expect(outcome.change).toBe('went-away');
    expect(new TablePresenceBo(outcome.roster).awaySinceOf(ANA_ID)).toEqual(LATER);
  });

  it('a new socket of someone away is came-back, bumping the version', () => {
    const roster = presenceRoster({
      version: 2,
      sockets: { [ANA_ID]: ['s1'] },
      away: ['s1'],
      awaySince: { [ANA_ID]: AT },
    });

    const outcome = new TablePresenceBo(roster).connect(ANA_ID, 's2');

    expect(outcome.change).toBe('came-back');
    expect(outcome.roster.version).toBe(3);
    expect(new TablePresenceBo(outcome.roster).awaySinceOf(ANA_ID)).toBeNull();
  });

  it('the active socket closing while the other stands still is went-away since then', () => {
    const roster = presenceRoster({
      version: 1,
      sockets: { [ANA_ID]: ['s1', 's2'] },
      away: ['s2'],
    });

    const outcome = new TablePresenceBo(roster).disconnect(ANA_ID, 's1', 'left', LATER);

    expect(outcome.change).toBe('went-away');
    expect(outcome.roster.version).toBe(2);
    expect(new TablePresenceBo(outcome.roster).awaySinceOf(ANA_ID)).toEqual(LATER);
  });

  it('standing still again while away is already-away, without a version', () => {
    const roster = presenceRoster({
      version: 2,
      sockets: { [ANA_ID]: ['s1'] },
      away: ['s1'],
      awaySince: { [ANA_ID]: AT },
    });

    const outcome = new TablePresenceBo(roster).markAway(ANA_ID, 's1', LATER);

    expect(outcome.change).toBe('already-away');
    expect(outcome.roster).toEqual(roster);
  });

  it('moving again while active is still-active, without a version', () => {
    const roster = presenceRoster({ version: 1, sockets: { [ANA_ID]: ['s1'] } });

    const outcome = new TablePresenceBo(roster).markActive(ANA_ID, 's1');

    expect(outcome.change).toBe('still-active');
    expect(outcome.roster).toEqual(roster);
  });

  it.each(['markAway', 'markActive'] as const)(
    '%s of a socket that is not the user is not-connected and changes nothing',
    (operation) => {
      const roster = presenceRoster({ version: 1, sockets: { [ANA_ID]: ['s1'] } });
      const presence = new TablePresenceBo(roster);

      const outcome =
        operation === 'markAway'
          ? presence.markAway(BIA_ID, 's1', AT)
          : presence.markActive(BIA_ID, 's1');

      expect(outcome.change).toBe('not-connected');
      expect(outcome.roster).toEqual(roster);
    },
  );

  it('leaving while away clears the absence along with the presence', () => {
    const roster = presenceRoster({
      version: 2,
      sockets: { [ANA_ID]: ['s1'] },
      away: ['s1'],
      awaySince: { [ANA_ID]: AT },
    });

    const outcome = new TablePresenceBo(roster).disconnect(ANA_ID, 's1', 'left', LATER);

    expect(outcome.change).toBe('went-offline');
    expect(outcome.roster).toEqual(presenceRoster({ version: 3 }));
  });
});

describe('TablePresenceBo.profileChanged', () => {
  it('a saved profile bumps the version and leaves sockets, grace and absence as they were', () => {
    const roster = presenceRoster({
      version: 4,
      sockets: { [ANA_ID]: ['s1'] },
      inGrace: [BIA_ID],
      away: ['s1'],
      awaySince: { [ANA_ID]: AT },
    });

    const outcome = new TablePresenceBo(roster).profileChanged();

    expect(outcome.change).toBe('profile-changed');
    expect(outcome.roster).toEqual({ ...roster, version: 5 });
  });
});

describe('TablePresenceBo.campaignChanged', () => {
  it('a saved campaign bumps the version and leaves sockets, grace and absence as they were', () => {
    const roster = presenceRoster({
      version: 2,
      sockets: { [ANA_ID]: ['s1'] },
      inGrace: [BIA_ID],
      away: ['s1'],
      awaySince: { [ANA_ID]: AT },
    });

    const outcome = new TablePresenceBo(roster).campaignChanged();

    expect(outcome.change).toBe('campaign-changed');
    expect(outcome.roster).toEqual({ ...roster, version: 3 });
  });
});

describe('TablePresenceBo.roleChanged', () => {
  it('a member moved between player and spectator bumps the version and leaves sockets, grace and absence as they were', () => {
    const roster = presenceRoster({
      version: 6,
      sockets: { [ANA_ID]: ['s1'] },
      inGrace: [BIA_ID],
      away: ['s1'],
      awaySince: { [ANA_ID]: AT },
    });

    const outcome = new TablePresenceBo(roster).roleChanged();

    expect(outcome.change).toBe('role-changed');
    expect(outcome.roster).toEqual({ ...roster, version: 7 });
  });
});

describe('TablePresenceBo.onlineUserIds', () => {
  it('counts who has a socket and who is inside the grace, like isOnline', () => {
    const CAIO = 'b4d6e8f0-1a2b-4c3d-8e5f-6a7b8c9d0e1f';
    const roster = presenceRoster({ version: 3, sockets: { [ANA_ID]: ['s1'] }, inGrace: [BIA_ID] });
    const online = new TablePresenceBo(roster).onlineUserIds();
    expect([...online].sort()).toEqual([ANA_ID, BIA_ID].sort());
    expect(online.has(CAIO)).toBe(false);
  });

  it('an empty table has nobody online', () => {
    expect(new TablePresenceBo(EMPTY_ROSTER).onlineUserIds().size).toBe(0);
  });
});

describe('TablePresenceBo.lists', () => {
  const roster = presenceRoster({ version: 3, sockets: { [ANA_ID]: ['s1'] }, inGrace: [DUDA_ID] });

  it('a spectator online (in grace counts) is listed', () => {
    expect(new TablePresenceBo(roster).lists({ userId: DUDA_ID, role: 'spectator' })).toBe(true);
  });

  it('a spectator offline is not listed', () => {
    expect(new TablePresenceBo(EMPTY_ROSTER).lists({ userId: DUDA_ID, role: 'spectator' })).toBe(
      false,
    );
  });

  it('a player offline is still listed', () => {
    expect(new TablePresenceBo(roster).lists({ userId: BIA_ID, role: 'player' })).toBe(true);
  });
});
