import { LEGAL_DOCUMENTS_VERSION } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  invitationLinkOf,
  invitationMailOf,
  linkOf,
  termsAcceptanceAt,
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

describe('invitationLinkOf', () => {
  it('an invitation from the backoffice opens /invite', () => {
    expect(invitationLinkOf('https://mesa.example.com', 'admin', 'abc')).toBe(
      'https://mesa.example.com/invite#token=abc',
    );
  });

  it('a link the person asked for at the sign-up opens /sign-up/confirm', () => {
    expect(invitationLinkOf('https://mesa.example.com', 'self', 'abc')).toBe(
      'https://mesa.example.com/sign-up/confirm#token=abc',
    );
  });
});

describe('invitationMailOf', () => {
  const target = {
    to: 'marina@exemplo.com',
    link: 'https://l',
    publicUrl: 'https://mesa.example.com',
  };

  it('the backoffice invitation is the 7-day invitation e-mail', () => {
    const mail = invitationMailOf('admin', target);
    expect(mail.subject).toBe('Seu convite para o Lorkarium');
    expect(mail.text).toContain('O link vale 7 dias');
  });

  it('the sign-up link is the 24-hour confirmation e-mail', () => {
    const mail = invitationMailOf('self', target);
    expect(mail.subject).toBe('Confirme seu cadastro no Lorkarium');
    expect(mail.text).toContain('O link vale 24 horas');
  });
});

describe('termsAcceptanceAt', () => {
  it('records the instant and the version of the legal texts in force', () => {
    const now = new Date('2026-10-25T12:00:00Z');
    expect(termsAcceptanceAt(now)).toEqual({
      termsAcceptedAt: now,
      termsVersion: LEGAL_DOCUMENTS_VERSION,
    });
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
      origin: 'admin' as const,
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
