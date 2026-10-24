import { describe, expect, it } from 'vitest';
import { toAdminUserDto } from '../../../src/modules/user-admin/user-admin.mapper';
import { DataCipherFake } from '../../support/auth-fakes';
import { ANA_ID, userPo } from '../../support/auth-factories';

const cipher = new DataCipherFake();

describe('toAdminUserDto', () => {
  it('opens the e-mail with the id as context and says active', () => {
    const user = toAdminUserDto({ ...userPo(), campaignCount: 2 }, cipher);
    expect(user).toMatchObject({
      id: ANA_ID,
      email: 'ana@mesa.com',
      status: 'active',
      campaignCount: 2,
      lastSeenAt: null,
      createdAt: '2026-10-01T12:00:00.000Z',
    });
  });

  it('a suspended account is "suspended" and the last seen goes out as ISO', () => {
    const row = userPo({
      suspendedAt: new Date('2026-10-20T00:00:00Z'),
      lastSeenAt: new Date('2026-10-19T09:30:00Z'),
    });
    const user = toAdminUserDto({ ...row, campaignCount: 0 }, cipher);
    expect(user.status).toBe('suspended');
    expect(user.lastSeenAt).toBe('2026-10-19T09:30:00.000Z');
  });

  it('an automatic color is drawn from the id, a chosen one is kept', () => {
    expect(toAdminUserDto({ ...userPo({ color: 'rose' }), campaignCount: 0 }, cipher).color).toBe(
      'rose',
    );
    expect(toAdminUserDto({ ...userPo({ color: null }), campaignCount: 0 }, cipher).color).toBe(
      'teal',
    );
  });

  it('never carries the hash nor the sealed columns', () => {
    const user = toAdminUserDto({ ...userPo(), campaignCount: 0 }, cipher);
    expect(Object.keys(user)).not.toEqual(
      expect.arrayContaining(['passwordHash', 'emailCipher', 'emailIndex']),
    );
    expect(JSON.stringify(user)).not.toContain('$argon2id');
  });
});
