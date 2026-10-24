import { describe, expect, it } from 'vitest';
import {
  linkOf,
  toAdminInvitationDto,
} from '../../../src/modules/account-links/account-links.mapper';
import { DataCipherFake } from '../../support/auth-fakes';

describe('linkOf', () => {
  it('puts the token in the fragment, encoded', () => {
    expect(linkOf('https://mesa.example.com', '/invite', 'a+b/c')).toBe(
      'https://mesa.example.com/invite#token=a%2Bb%2Fc',
    );
  });
});

describe('toAdminInvitationDto', () => {
  it('opens the address with the invitation id as context and keeps the @ of who invited', () => {
    const row = {
      id: 'inv-1',
      tokenHash: 'sha:t',
      emailCipher: 'sealed:invitation-email:inv-1:marina@exemplo.com',
      emailIndex: 'idx:email-index:marina@exemplo.com',
      role: 'user' as const,
      invitedBy: 'lucas-id',
      invitedByUsername: 'lucas',
      sentAt: new Date('2026-10-24T12:00:00Z'),
      expiresAt: new Date('2026-10-31T12:00:00Z'),
    };
    expect(toAdminInvitationDto(row, new DataCipherFake())).toEqual({
      id: 'inv-1',
      email: 'marina@exemplo.com',
      role: 'user',
      invitedBy: 'lucas',
      sentAt: '2026-10-24T12:00:00.000Z',
      expiresAt: '2026-10-31T12:00:00.000Z',
    });
  });
});
