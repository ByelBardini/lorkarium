import { describe, expect, it } from 'vitest';
import { EMPTY_ROSTER, TablePresenceBo } from '../../../src/modules/sessions/table-presence.bo';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID } from '../../support/campaigns-factories';
import { presenceRoster } from '../../support/sessions-factories';

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
    const outcome = new TablePresenceBo(roster).disconnect(ANA_ID, 's1', 'left');
    expect(outcome.change).toBe('still-online');
    expect(outcome.roster).toEqual(presenceRoster({ version: 1, sockets: { [ANA_ID]: ['s2'] } }));
  });

  it('leaving from the last socket takes the user offline at once and bumps the version', () => {
    const roster = presenceRoster({ version: 1, sockets: { [ANA_ID]: ['s1'] } });
    const outcome = new TablePresenceBo(roster).disconnect(ANA_ID, 's1', 'left');
    expect(outcome.change).toBe('went-offline');
    expect(outcome.roster).toEqual(presenceRoster({ version: 2 }));
  });

  it('dropping the last socket starts the grace period: still online, same version', () => {
    const roster = presenceRoster({ version: 1, sockets: { [ANA_ID]: ['s1'] } });
    const outcome = new TablePresenceBo(roster).disconnect(ANA_ID, 's1', 'dropped');
    expect(outcome.change).toBe('grace-started');
    expect(outcome.roster).toEqual(presenceRoster({ version: 1, inGrace: [ANA_ID] }));
    expect(new TablePresenceBo(outcome.roster).isOnline(ANA_ID)).toBe(true);
  });

  it('disconnecting a socket the user does not hold is not-connected and changes nothing', () => {
    const roster = presenceRoster({ version: 1, sockets: { [ANA_ID]: ['s1'] } });
    const outcome = new TablePresenceBo(roster).disconnect(ANA_ID, 's9', 'left');
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
    const outcome = new TablePresenceBo(roster).disconnect(BIA_ID, 's2', 'left');
    expect(outcome.roster).toEqual(presenceRoster({ version: 3, sockets: { [ANA_ID]: ['s1'] } }));
  });

  it('Bia dropping a socket id that Ana holds does not disconnect Ana', () => {
    const roster = presenceRoster({ version: 1, sockets: { [ANA_ID]: ['s1'] } });
    const outcome = new TablePresenceBo(roster).disconnect(BIA_ID, 's1', 'dropped');
    expect(outcome.change).toBe('not-connected');
    expect(outcome.roster).toEqual(roster);
  });

  it('the roster given to the rule is never mutated by any operation', () => {
    const roster = presenceRoster({ version: 1, sockets: { [ANA_ID]: ['s1'] }, inGrace: [BIA_ID] });
    const presence = new TablePresenceBo(roster);
    presence.connect(ANA_ID, 's2');
    presence.connect(BIA_ID, 's3');
    presence.disconnect(ANA_ID, 's1', 'dropped');
    presence.expireGrace(BIA_ID);
    expect(roster).toEqual(
      presenceRoster({ version: 1, sockets: { [ANA_ID]: ['s1'] }, inGrace: [BIA_ID] }),
    );
  });
});
