import { describe, expect, it } from 'vitest';
import { InMemoryPresenceRegistry } from '../../../src/infrastructure/presence-registry/in-memory-presence-registry';
import { ANA_ID } from '../../support/auth-factories';
import { QUELM_ID, VHARN_ID } from '../../support/campaigns-factories';
import { presenceRoster } from '../../support/sessions-factories';

describe('InMemoryPresenceRegistry', () => {
  it('a table nobody has entered has no roster', () => {
    expect(new InMemoryPresenceRegistry().rosterOf(VHARN_ID)).toBeUndefined();
  });

  it('a saved roster is the one read back for that table', () => {
    const registry = new InMemoryPresenceRegistry();
    const roster = presenceRoster({ version: 1, sockets: { [ANA_ID]: ['s1'] } });
    registry.save(VHARN_ID, roster);
    expect(registry.rosterOf(VHARN_ID)).toEqual(
      presenceRoster({ version: 1, sockets: { [ANA_ID]: ['s1'] } }),
    );
  });

  it('saving one table leaves another table empty', () => {
    const registry = new InMemoryPresenceRegistry();
    registry.save(VHARN_ID, presenceRoster({ version: 1, sockets: { [ANA_ID]: ['s1'] } }));
    expect(registry.rosterOf(QUELM_ID)).toBeUndefined();
  });

  it('saving a roster with nobody in it drops the table, so an abandoned one holds no memory', () => {
    const registry = new InMemoryPresenceRegistry();
    registry.save(VHARN_ID, presenceRoster({ version: 1, sockets: { [ANA_ID]: ['s1'] } }));
    registry.save(VHARN_ID, presenceRoster({ version: 2 }));
    expect(registry.rosterOf(VHARN_ID)).toBeUndefined();
    expect(registry.tableCount()).toBe(0);
  });

  it('a roster with someone in grace is kept', () => {
    const registry = new InMemoryPresenceRegistry();
    registry.save(VHARN_ID, presenceRoster({ version: 1, inGrace: [ANA_ID] }));
    expect(registry.rosterOf(VHARN_ID)).toEqual(presenceRoster({ version: 1, inGrace: [ANA_ID] }));
  });
});
