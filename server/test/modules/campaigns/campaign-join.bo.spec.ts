import { describe, expect, it } from 'vitest';
import {
  CampaignJoinBo,
  seesPrivateInExplore,
} from '../../../src/modules/campaigns/campaign-join.bo';
import { VHARN_ID } from '../../support/campaigns-factories';

function joinOf(
  isMember: boolean,
  hasPassword: boolean,
  isPublic = false,
  readerIsAdmin = false,
  blockedByOwner = false,
): CampaignJoinBo {
  return new CampaignJoinBo({
    campaignId: VHARN_ID,
    isMember,
    hasPassword,
    isPublic,
    readerIsAdmin,
    blockedByOwner,
    userId: CAIO_ID,
  });
}

const CAIO_ID = 'caio-id';

describe('CampaignJoinBo', () => {
  it('a reader the owner blocked is refused with CAMPAIGN_NOT_FOUND, as if the table did not exist', () => {
    expect(() => joinOf(false, false, true, false, true).requireNotBlocked()).toThrow(
      expect.objectContaining({
        code: 'CAMPAIGN_NOT_FOUND',
        message: expect.stringContaining(CAIO_ID),
      }),
    );
  });

  it('the block holds for an admin too', () => {
    expect(() => joinOf(false, false, true, true, true).requireNotBlocked()).toThrow(
      expect.objectContaining({ code: 'CAMPAIGN_NOT_FOUND' }),
    );
  });

  it('a reader the owner did not block passes the block check', () => {
    expect(() => joinOf(false, false, true, false, false).requireNotBlocked()).not.toThrow();
  });

  it.each([
    ['an admin at a private table', true, false, true, true],
    ['an admin at a public table with a password', true, true, true, true],
    ['an admin at a public open table', true, true, false, false],
    ['someone else at a private table', false, false, true, false],
  ])('bypassesGate: %s', (_case, readerIsAdmin, isPublic, hasPassword, expected) => {
    expect(joinOf(false, hasPassword, isPublic, readerIsAdmin).bypassesGate()).toBe(expected);
  });

  it.each([true, false])(
    'someone who is already a member gets already-member (campaign has password: %s)',
    (hasPassword) => {
      expect(joinOf(true, hasPassword).decide('not-required')).toBe('already-member');
    },
  );

  it('a member never needs the password checked', () => {
    expect(joinOf(true, true).needsPasswordCheck()).toBe(false);
  });

  it('a newcomer to a campaign with a password needs it checked', () => {
    expect(joinOf(false, true).needsPasswordCheck()).toBe(true);
  });

  it('a newcomer to a campaign without a password joins as spectator', () => {
    const join = joinOf(false, false);
    expect(join.needsPasswordCheck()).toBe(false);
    expect(join.decide('not-required')).toBe('join-as-spectator');
  });

  it('a campaign with a password and none sent is refused with CAMPAIGN_PASSWORD_REQUIRED', () => {
    expect(() => joinOf(false, true).decide('missing')).toThrow(
      expect.objectContaining({
        code: 'CAMPAIGN_PASSWORD_REQUIRED',
        message: expect.stringContaining(VHARN_ID),
      }),
    );
  });

  it('a password that does not match is refused with CAMPAIGN_PASSWORD_INVALID', () => {
    expect(() => joinOf(false, true).decide('mismatch')).toThrow(
      expect.objectContaining({
        code: 'CAMPAIGN_PASSWORD_INVALID',
        message: expect.stringContaining(VHARN_ID),
      }),
    );
  });

  it('a password that matches joins as spectator', () => {
    expect(joinOf(false, true).decide('matches')).toBe('join-as-spectator');
  });

  it('a campaign with a password reported as not-required is a programming error citing the campaign', () => {
    expect(() => joinOf(false, true).decide('not-required')).toThrow(VHARN_ID);
  });

  it('a public campaign may be joined without its code', () => {
    expect(() => joinOf(false, false, true).requirePublic()).not.toThrow();
  });

  it('a private campaign joined without its code is refused with CAMPAIGN_NOT_FOUND citing it', () => {
    expect(() => joinOf(false, false, false).requirePublic()).toThrow(
      expect.objectContaining({
        code: 'CAMPAIGN_NOT_FOUND',
        message: expect.stringContaining(VHARN_ID),
      }),
    );
  });

  it('even a member of a private campaign is refused there: the code is the only way in', () => {
    expect(() => joinOf(true, false, false).requirePublic()).toThrow(
      expect.objectContaining({ code: 'CAMPAIGN_NOT_FOUND' }),
    );
  });

  it('an admin reaches a private campaign without its code', () => {
    expect(() => joinOf(false, false, false, true).requirePublic()).not.toThrow();
  });

  it('an admin newcomer to a protected campaign skips the password and joins as spectator', () => {
    const join = joinOf(false, true, false, true);
    expect(join.needsPasswordCheck()).toBe(false);
    expect(join.decide('not-required')).toBe('join-as-spectator');
  });

  it.each([
    ['admin', true],
    ['user', false],
  ] as const)('a reader with role %s sees private campaigns in Explorar: %s', (role, sees) => {
    expect(seesPrivateInExplore(role)).toBe(sees);
  });
});
