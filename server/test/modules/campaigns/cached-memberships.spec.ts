import { describe, expect, it } from 'vitest';
import { CachedMemberships } from '../../../src/modules/campaigns/cached-memberships';
import { ANA_ID } from '../../support/auth-factories';
import { MembershipReadsFake } from '../../support/campaigns-fakes';
import { BIA_ID, QUELM_ID, VHARN_ID, campaignMemberPo } from '../../support/campaigns-factories';

const ANA_IN_VHARN = campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' });
const BIA_IN_VHARN = campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' });

describe('CachedMemberships', () => {
  it('the second read of the same table and user does not go to the DAO again', async () => {
    const dao = new MembershipReadsFake([ANA_IN_VHARN]);
    const memberships = new CachedMemberships(dao);
    await memberships.findMembership(VHARN_ID, ANA_ID);
    expect(await memberships.findMembership(VHARN_ID, ANA_ID)).toEqual(ANA_IN_VHARN);
    expect(dao.reads).toEqual([`${VHARN_ID}:${ANA_ID}`]);
  });

  it('"not a member" is not remembered: who joins by code right after is accepted', async () => {
    const dao = new MembershipReadsFake();
    const memberships = new CachedMemberships(dao);
    expect(await memberships.findMembership(VHARN_ID, BIA_ID)).toBeUndefined();
    dao.rows.push(BIA_IN_VHARN);
    expect(await memberships.findMembership(VHARN_ID, BIA_ID)).toEqual(BIA_IN_VHARN);
    expect(dao.reads).toHaveLength(2);
  });

  it('a member of table A read before does not count for table B', async () => {
    const dao = new MembershipReadsFake([ANA_IN_VHARN]);
    const memberships = new CachedMemberships(dao);
    await memberships.findMembership(VHARN_ID, ANA_ID);
    expect(await memberships.findMembership(QUELM_ID, ANA_ID)).toBeUndefined();
    expect(dao.reads).toEqual([`${VHARN_ID}:${ANA_ID}`, `${QUELM_ID}:${ANA_ID}`]);
  });

  it('at the entry limit the memory starts over and the next read goes to the DAO', async () => {
    const dao = new MembershipReadsFake([ANA_IN_VHARN, BIA_IN_VHARN]);
    const memberships = new CachedMemberships(dao, 1);
    await memberships.findMembership(VHARN_ID, ANA_ID);
    await memberships.findMembership(VHARN_ID, BIA_ID);
    await memberships.findMembership(VHARN_ID, ANA_ID);
    expect(dao.reads).toEqual([
      `${VHARN_ID}:${ANA_ID}`,
      `${VHARN_ID}:${BIA_ID}`,
      `${VHARN_ID}:${ANA_ID}`,
    ]);
  });

  it('the member list is read from the DAO every time: someone may have joined by code', async () => {
    const dao = new MembershipReadsFake([ANA_IN_VHARN]);
    const memberships = new CachedMemberships(dao);
    await memberships.listMembers(VHARN_ID);
    dao.rows.push(BIA_IN_VHARN);
    const listed = await memberships.listMembers(VHARN_ID);
    expect(listed.map((member) => member.userId)).toEqual([ANA_ID, BIA_ID]);
    expect(dao.reads).toEqual([`list:${VHARN_ID}`, `list:${VHARN_ID}`]);
  });

  it('forget(table, user) makes the next read go to the DAO', async () => {
    const dao = new MembershipReadsFake([ANA_IN_VHARN]);
    const memberships = new CachedMemberships(dao);
    await memberships.findMembership(VHARN_ID, ANA_ID);
    memberships.forget(VHARN_ID, ANA_ID);
    await memberships.findMembership(VHARN_ID, ANA_ID);
    expect(dao.reads).toHaveLength(2);
  });

  it('forgetUser sends the next reads of that person to the DAO and keeps the others', async () => {
    const anaInQuelm = campaignMemberPo({ campaignId: QUELM_ID, userId: ANA_ID, role: 'player' });
    const dao = new MembershipReadsFake([ANA_IN_VHARN, anaInQuelm, BIA_IN_VHARN]);
    const memberships = new CachedMemberships(dao);
    await memberships.findMembership(VHARN_ID, ANA_ID);
    await memberships.findMembership(QUELM_ID, ANA_ID);
    await memberships.findMembership(VHARN_ID, BIA_ID);
    memberships.forgetUser(ANA_ID);
    dao.reads.length = 0;
    await memberships.findMembership(VHARN_ID, ANA_ID);
    await memberships.findMembership(QUELM_ID, ANA_ID);
    await memberships.findMembership(VHARN_ID, BIA_ID);
    expect(dao.reads).toEqual([`${VHARN_ID}:${ANA_ID}`, `${QUELM_ID}:${ANA_ID}`]);
  });
});
