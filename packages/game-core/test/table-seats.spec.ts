import { describe, expect, it } from 'vitest';
import {
  assignableRolesOf,
  hasOwnerPowers,
  isRoleLocked,
  type TableSeat,
} from '../src/table-seats';

const ana: TableSeat = { role: 'master', owner: true, juggernaut: false };
const coMaster: TableSeat = { role: 'master', owner: false, juggernaut: false };
const otherCoMaster: TableSeat = { role: 'master', owner: false, juggernaut: false };
const root: TableSeat = { role: 'master', owner: false, juggernaut: true };
const player: TableSeat = { role: 'player', owner: false, juggernaut: false };
const spectator: TableSeat = { role: 'spectator', owner: false, juggernaut: false };

describe('assignableRolesOf', () => {
  it('the owner makes a player master or spectator', () => {
    expect(assignableRolesOf(ana, player)).toEqual(['master', 'spectator']);
  });

  it('the owner makes a spectator master or player', () => {
    expect(assignableRolesOf(ana, spectator)).toEqual(['master', 'player']);
  });

  it('the owner demotes a co-master to player or spectator', () => {
    expect(assignableRolesOf(ana, coMaster)).toEqual(['player', 'spectator']);
  });

  it('a juggernaut demotes a co-master like the owner does', () => {
    expect(assignableRolesOf(root, coMaster)).toEqual(['player', 'spectator']);
  });

  it('a juggernaut promotes a player to master', () => {
    expect(assignableRolesOf(root, player)).toEqual(['master', 'spectator']);
  });

  it('a co-master moves a player to the spectators, never to master', () => {
    expect(assignableRolesOf(coMaster, player)).toEqual(['spectator']);
  });

  it('a co-master moves a spectator to the players, never to master', () => {
    expect(assignableRolesOf(coMaster, spectator)).toEqual(['player']);
  });

  it('nobody changes the owner, not even a juggernaut', () => {
    expect(assignableRolesOf(root, ana)).toEqual([]);
    expect(assignableRolesOf(coMaster, ana)).toEqual([]);
  });

  it('nobody changes a juggernaut, not even the owner', () => {
    expect(assignableRolesOf(ana, root)).toEqual([]);
    expect(assignableRolesOf(coMaster, root)).toEqual([]);
  });

  it('a co-master does not change another co-master', () => {
    expect(assignableRolesOf(coMaster, otherCoMaster)).toEqual([]);
  });

  it('a player or a spectator changes nobody', () => {
    expect(assignableRolesOf(player, spectator)).toEqual([]);
    expect(assignableRolesOf(spectator, player)).toEqual([]);
  });

  it('nobody changes their own seat', () => {
    expect(assignableRolesOf(ana, ana)).toEqual([]);
    expect(assignableRolesOf(root, root)).toEqual([]);
    expect(assignableRolesOf(coMaster, coMaster)).toEqual([]);
  });
});

describe('hasOwnerPowers', () => {
  it('the owner and a juggernaut have them, a co-master does not', () => {
    expect(hasOwnerPowers(ana)).toBe(true);
    expect(hasOwnerPowers(root)).toBe(true);
    expect(hasOwnerPowers(coMaster)).toBe(false);
  });
});

describe('isRoleLocked', () => {
  it('locks the owner and a juggernaut, not a co-master', () => {
    expect(isRoleLocked(ana)).toBe(true);
    expect(isRoleLocked(root)).toBe(true);
    expect(isRoleLocked(coMaster)).toBe(false);
  });
});
