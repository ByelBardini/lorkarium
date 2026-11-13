import { describe, expect, it } from 'vitest';
import {
  AccountPresenceBo,
  EMPTY_ACCOUNT_PRESENCE,
  seenPresenceChanged,
  type AccountPresence,
  type OpenedTable,
} from '../../../src/modules/account-presence/account-presence.bo';

const VHARN: OpenedTable = {
  campaignId: '7d1f6f0e-8f37-4c2e-9a4b-2f0c7b1a9e01',
  name: 'Vharn',
  isPublic: true,
};
const CRIPTA: OpenedTable = {
  campaignId: '7d1f6f0e-8f37-4c2e-9a4b-2f0c7b1a9e02',
  name: 'Cripta',
  isPublic: true,
};
const SEGREDO: OpenedTable = {
  campaignId: '7d1f6f0e-8f37-4c2e-9a4b-2f0c7b1a9e03',
  name: 'Segredo',
  isPublic: false,
};

function online(socketId: string): AccountPresence {
  return new AccountPresenceBo(EMPTY_ACCOUNT_PRESENCE).connect(socketId).state;
}

function withSockets(...socketIds: string[]): AccountPresence {
  return socketIds.reduce(
    (state, socketId) => new AccountPresenceBo(state).connect(socketId).state,
    EMPTY_ACCOUNT_PRESENCE,
  );
}

describe('AccountPresenceBo.connect', () => {
  it('the first socket brings the account online', () => {
    const outcome = new AccountPresenceBo(EMPTY_ACCOUNT_PRESENCE).connect('s1');
    expect(outcome.change).toBe('came-online');
    expect(new AccountPresenceBo(outcome.state).seen()).toEqual({ status: 'online', table: null });
  });

  it('a second tab is already-online and friends see nothing new', () => {
    const before = online('s1');
    const outcome = new AccountPresenceBo(before).connect('s2');
    expect(outcome.change).toBe('already-online');
    expect(seenPresenceChanged(before, outcome.state)).toBe(false);
  });

  it('reconnecting inside the grace returns without going offline', () => {
    const dropped = new AccountPresenceBo(online('s1')).disconnect('s1', 'dropped').state;
    const outcome = new AccountPresenceBo(dropped).connect('s2');
    expect(outcome.change).toBe('returned-in-grace');
    expect(outcome.state.inGrace).toBe(false);
  });

  it('does not mutate the state it was built from', () => {
    const before = online('s1');
    new AccountPresenceBo(before).connect('s2');
    expect([...before.sockets]).toEqual(['s1']);
  });
});

describe('AccountPresenceBo.disconnect and expireGrace', () => {
  it('a drop of the last socket keeps the account online during the grace', () => {
    const outcome = new AccountPresenceBo(online('s1')).disconnect('s1', 'dropped');
    expect(outcome.change).toBe('grace-started');
    expect(new AccountPresenceBo(outcome.state).seen().status).toBe('online');
  });

  it('the grace running out takes the account offline', () => {
    const dropped = new AccountPresenceBo(online('s1')).disconnect('s1', 'dropped').state;
    const outcome = new AccountPresenceBo(dropped).expireGrace();
    expect(outcome.change).toBe('went-offline');
    expect(new AccountPresenceBo(outcome.state).seen()).toEqual({ status: 'offline', table: null });
  });

  it('the grace running out after a reconnect is already-back', () => {
    const dropped = new AccountPresenceBo(online('s1')).disconnect('s1', 'dropped').state;
    const back = new AccountPresenceBo(dropped).connect('s2').state;
    expect(new AccountPresenceBo(back).expireGrace().change).toBe('already-back');
  });

  it('logging out (left) goes offline at once, with no grace', () => {
    const outcome = new AccountPresenceBo(online('s1')).disconnect('s1', 'left');
    expect(outcome.change).toBe('went-offline');
  });

  it('closing one of two tabs is still-online', () => {
    const outcome = new AccountPresenceBo(withSockets('s1', 's2')).disconnect('s1', 'left');
    expect(outcome.change).toBe('still-online');
  });

  it('an unknown socket is not-connected and returns the same state, twice', () => {
    const before = online('s1');
    const first = new AccountPresenceBo(before).disconnect('ghost', 'left');
    const second = new AccountPresenceBo(first.state).disconnect('ghost', 'left');
    expect([first.change, second.change]).toEqual(['not-connected', 'not-connected']);
    expect(second.state).toBe(before);
  });

  it('expireGrace on an account with no socket nor grace is not-connected', () => {
    expect(new AccountPresenceBo(EMPTY_ACCOUNT_PRESENCE).expireGrace().change).toBe(
      'not-connected',
    );
  });
});

describe('AccountPresenceBo away', () => {
  it('away only once every tab stands still', () => {
    const one = new AccountPresenceBo(withSockets('s1', 's2')).markAway('s1');
    expect(one.change).toBe('still-active');
    const both = new AccountPresenceBo(one.state).markAway('s2');
    expect(both.change).toBe('went-away');
    expect(new AccountPresenceBo(both.state).seen().status).toBe('away');
  });

  it('a still tab moving again brings the account back', () => {
    const away = new AccountPresenceBo(online('s1')).markAway('s1').state;
    const outcome = new AccountPresenceBo(away).markActive('s1');
    expect(outcome.change).toBe('came-back');
    expect(new AccountPresenceBo(outcome.state).seen().status).toBe('online');
  });

  it('closing the only active tab leaves the still one: went-away', () => {
    const state = new AccountPresenceBo(withSockets('s1', 's2')).markAway('s1').state;
    expect(new AccountPresenceBo(state).disconnect('s2', 'left').change).toBe('went-away');
  });

  it('a new tab of an away account brings it back', () => {
    const away = new AccountPresenceBo(online('s1')).markAway('s1').state;
    expect(new AccountPresenceBo(away).connect('s2').change).toBe('came-back');
  });

  it('marking an unknown socket is not-connected', () => {
    expect(new AccountPresenceBo(online('s1')).markAway('ghost').change).toBe('not-connected');
    expect(new AccountPresenceBo(online('s1')).markActive('ghost').change).toBe('not-connected');
  });
});

describe('AccountPresenceBo.setVisibility', () => {
  it('invisible is seen as offline, even with sockets open', () => {
    const outcome = new AccountPresenceBo(online('s1')).setVisibility('invisible');
    expect(outcome.change).toBe('visibility-changed');
    expect(new AccountPresenceBo(outcome.state).seen()).toEqual({ status: 'offline', table: null });
    expect(new AccountPresenceBo(outcome.state).isVisiblyOnline()).toBe(false);
  });

  it('going back to online is a seen change', () => {
    const hidden = new AccountPresenceBo(online('s1')).setVisibility('invisible').state;
    const outcome = new AccountPresenceBo(hidden).setVisibility('online');
    expect(seenPresenceChanged(hidden, outcome.state)).toBe(true);
    expect(new AccountPresenceBo(outcome.state).seen().status).toBe('online');
  });

  it('choosing the same visibility again is visibility-unchanged', () => {
    expect(new AccountPresenceBo(online('s1')).setVisibility('online').change).toBe(
      'visibility-unchanged',
    );
  });

  it('an invisible account that goes away still shows offline', () => {
    const hidden = new AccountPresenceBo(online('s1')).setVisibility('invisible').state;
    const away = new AccountPresenceBo(hidden).markAway('s1').state;
    expect(new AccountPresenceBo(away).seen().status).toBe('offline');
    expect(seenPresenceChanged(hidden, away)).toBe(false);
  });
});

describe('AccountPresenceBo tables', () => {
  it('an open public table is shown with id and name', () => {
    const outcome = new AccountPresenceBo(online('s1')).openTable('s1', VHARN);
    expect(outcome.change).toBe('table-opened');
    expect(new AccountPresenceBo(outcome.state).seen().table).toEqual({
      campaignId: VHARN.campaignId,
      name: 'Vharn',
    });
  });

  it('a private table is shown as null', () => {
    const state = new AccountPresenceBo(online('s1')).openTable('s1', SEGREDO).state;
    expect(new AccountPresenceBo(state).seen().table).toBeNull();
  });

  it('two public tables show the last one opened', () => {
    const one = new AccountPresenceBo(withSockets('s1', 's2')).openTable('s1', VHARN).state;
    const two = new AccountPresenceBo(one).openTable('s2', CRIPTA).state;
    expect(new AccountPresenceBo(two).seen().table?.name).toBe('Cripta');
  });

  it('closing the last table falls back to the earlier public one', () => {
    const one = new AccountPresenceBo(withSockets('s1', 's2')).openTable('s1', VHARN).state;
    const two = new AccountPresenceBo(one).openTable('s2', CRIPTA).state;
    const outcome = new AccountPresenceBo(two).closeTable('s2', CRIPTA.campaignId);
    expect(outcome.change).toBe('table-closed');
    expect(new AccountPresenceBo(outcome.state).seen().table?.name).toBe('Vharn');
  });

  it('a socket going away takes its tables with it', () => {
    const state = new AccountPresenceBo(withSockets('s1', 's2')).openTable('s2', VHARN).state;
    const outcome = new AccountPresenceBo(state).disconnect('s2', 'left');
    expect(new AccountPresenceBo(outcome.state).seen().table).toBeNull();
  });

  it('reopening the same table in the same socket is table-unchanged', () => {
    const state = new AccountPresenceBo(online('s1')).openTable('s1', VHARN).state;
    expect(new AccountPresenceBo(state).openTable('s1', VHARN).change).toBe('table-unchanged');
  });

  it('closing a table never opened is table-unchanged', () => {
    expect(new AccountPresenceBo(online('s1')).closeTable('s1', VHARN.campaignId).change).toBe(
      'table-unchanged',
    );
  });

  it('opening a table on an unknown socket is not-connected', () => {
    expect(new AccountPresenceBo(online('s1')).openTable('ghost', VHARN).change).toBe(
      'not-connected',
    );
  });

  it('an invisible account shows no table', () => {
    const hidden = new AccountPresenceBo(online('s1')).setVisibility('invisible').state;
    const state = new AccountPresenceBo(hidden).openTable('s1', VHARN).state;
    expect(new AccountPresenceBo(state).seen()).toEqual({ status: 'offline', table: null });
  });
});

describe('AccountPresenceBo.isEmpty', () => {
  it('is empty with no socket and no grace, so the registry may drop it', () => {
    const gone = new AccountPresenceBo(online('s1')).disconnect('s1', 'left').state;
    expect(new AccountPresenceBo(gone).isEmpty()).toBe(true);
    const dropped = new AccountPresenceBo(online('s1')).disconnect('s1', 'dropped').state;
    expect(new AccountPresenceBo(dropped).isEmpty()).toBe(false);
  });
});
