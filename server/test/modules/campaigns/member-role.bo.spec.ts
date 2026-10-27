import type { TableSeat } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { MemberRoleBo, type SeatedMember } from '../../../src/modules/campaigns/member-role.bo';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, DUDA_ID, VHARN_ID } from '../../support/campaigns-factories';

const ROOT_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const EVA_ID = 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b';

function seat(role: TableSeat['role'], extra: Partial<TableSeat> = {}): TableSeat {
  return { role, owner: false, juggernaut: false, ...extra };
}

// Ana owns Vharn; Bia and Eva are co-masters; Caio plays; Duda watches; Root is a juggernaut.
const ANA: SeatedMember = { userId: ANA_ID, seat: seat('master', { owner: true }) };
const BIA: SeatedMember = { userId: BIA_ID, seat: seat('master') };
const EVA: SeatedMember = { userId: EVA_ID, seat: seat('master') };
const CAIO: SeatedMember = { userId: CAIO_ID, seat: seat('player') };
const DUDA: SeatedMember = { userId: DUDA_ID, seat: seat('spectator') };
const ROOT: SeatedMember = { userId: ROOT_ID, seat: seat('master', { juggernaut: true }) };

function decide(requester: SeatedMember, target: SeatedMember, role: TableSeat['role']) {
  return new MemberRoleBo(VHARN_ID, requester, target).decide(role);
}

function refusal(code: string, ...cited: string[]) {
  return expect.objectContaining({ code, message: expect.stringMatching(cited.join('.*')) });
}

describe('MemberRoleBo.decide: what the owner and the co-masters change', () => {
  it.each([
    ['Caio, a player, to master', CAIO, 'master', 'player'],
    ['Duda, a spectator, to master', DUDA, 'master', 'spectator'],
    ['Bia, a co-master, to spectator', BIA, 'spectator', 'master'],
  ] as const)('Ana, the owner, puts %s', (_case, target, to, from) => {
    expect(decide(ANA, target, to)).toEqual({ change: 'changed', from, to });
  });

  it('Bia, a co-master, promotes Duda from spectator to player', () => {
    expect(decide(BIA, DUDA, 'player')).toEqual({
      change: 'changed',
      from: 'spectator',
      to: 'player',
    });
  });

  it('Ana asking master for Bia, already a master, is unchanged (asking again is harmless)', () => {
    expect(decide(ANA, BIA, 'master')).toEqual({ change: 'unchanged', role: 'master' });
  });

  it('Root, a juggernaut, demotes Bia and promotes Caio, as the owner does', () => {
    expect(decide(ROOT, BIA, 'player')).toMatchObject({ change: 'changed', to: 'player' });
    expect(decide(ROOT, CAIO, 'master')).toMatchObject({ change: 'changed', to: 'master' });
  });
});

describe('MemberRoleBo.decide: what is refused', () => {
  it('Bia, a co-master, putting Caio in master is FORBIDDEN citing her, Caio and owner powers', () => {
    expect(() => decide(BIA, CAIO, 'master')).toThrow(
      refusal('FORBIDDEN', BIA_ID, CAIO_ID, VHARN_ID, 'owner powers'),
    );
  });

  it('Bia, a co-master, demoting Eva, another co-master, is FORBIDDEN', () => {
    expect(() => decide(BIA, EVA, 'player')).toThrow(
      refusal('FORBIDDEN', BIA_ID, EVA_ID, VHARN_ID, 'owner powers'),
    );
  });

  it.each([
    ['Bia, a co-master', BIA],
    ['Root, a juggernaut', ROOT],
    ['Ana herself', ANA],
  ])(
    "%s asking to change Ana, the owner, is FORBIDDEN: the owner's role does not change",
    (_who, requester) => {
      expect(() => decide(requester, ANA, 'player')).toThrow(
        refusal('FORBIDDEN', ANA_ID, VHARN_ID, "the owner's role does not change"),
      );
    },
  );

  it.each([
    ['Ana, the owner', ANA],
    ['Root himself', ROOT],
  ])(
    "%s asking to change Root is FORBIDDEN: a juggernaut's role does not change",
    (_who, requester) => {
      expect(() => decide(requester, ROOT, 'player')).toThrow(
        refusal('FORBIDDEN', ROOT_ID, VHARN_ID, "a juggernaut's role does not change"),
      );
    },
  );

  it.each([
    ['Caio, a player', CAIO, DUDA],
    ['Duda, a spectator', DUDA, CAIO],
  ])('%s asking is FORBIDDEN citing the master role', (_who, requester, target) => {
    expect(() => decide(requester, target, 'spectator')).toThrow(
      refusal('FORBIDDEN', requester.userId, VHARN_ID, 'the master role'),
    );
  });

  it('someone outside Vharn asking gets CAMPAIGN_NOT_FOUND, before the target is looked at', () => {
    const stranger = { userId: EVA_ID, seat: null };
    expect(() => decide(stranger, { userId: CAIO_ID, seat: null }, 'player')).toThrow(
      expect.objectContaining({ code: 'CAMPAIGN_NOT_FOUND' }),
    );
  });

  it('a target outside Vharn is MEMBER_NOT_FOUND citing the table and the id', () => {
    expect(() => decide(ANA, { userId: EVA_ID, seat: null }, 'player')).toThrow(
      refusal('MEMBER_NOT_FOUND', VHARN_ID, EVA_ID),
    );
  });
});
