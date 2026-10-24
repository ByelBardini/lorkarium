import { describe, expect, it } from 'vitest';
import { PresenceReaderService } from '../../../src/modules/sessions/presence-reader.service';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, QUELM_ID, VHARN_ID } from '../../support/campaigns-factories';
import { PresenceRegistryFake } from '../../support/sessions-fakes';
import { presenceRoster } from '../../support/sessions-factories';

describe('PresenceReaderService', () => {
  it('a table nobody is at has nobody online', () => {
    const reader = new PresenceReaderService(new PresenceRegistryFake());
    expect(reader.onlineUserIdsOf(VHARN_ID).size).toBe(0);
  });

  it('who has a socket or is inside the grace is online, and only at that table', () => {
    const registry = new PresenceRegistryFake();
    const vharn = presenceRoster({ version: 2, sockets: { [ANA_ID]: ['s1'] }, inGrace: [BIA_ID] });
    registry.save(VHARN_ID, vharn);
    registry.save(QUELM_ID, presenceRoster({ version: 1, sockets: { [CAIO_ID]: ['s2'] } }));
    const reader = new PresenceReaderService(registry);
    expect([...reader.onlineUserIdsOf(VHARN_ID)].sort()).toEqual([ANA_ID, BIA_ID].sort());
    expect(reader.onlineUserIdsOf(VHARN_ID).has(CAIO_ID)).toBe(false);
  });
});
