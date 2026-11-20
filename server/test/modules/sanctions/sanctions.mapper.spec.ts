import { describe, expect, it } from 'vitest';
import {
  sanctionMailOf,
  toAccountSanctionDto,
} from '../../../src/modules/sanctions/sanctions.mapper';
import { accountSanctionPo } from '../../support/sanctions-factories';

const names = { issuedByUsername: 'fernanda', decidedByUsername: null };

describe('toAccountSanctionDto', () => {
  it('a measure without an appeal goes out with appeal null and the @ of who applied it', () => {
    const dto = toAccountSanctionDto({ ...accountSanctionPo(), ...names });
    expect(dto).toMatchObject({
      kind: 'warning',
      until: null,
      issuedBy: 'fernanda',
      issuedAt: '2026-11-18T12:00:00.000Z',
      appeal: null,
    });
  });

  it('a decided appeal carries the outcome, the note and who decided', () => {
    const decided = accountSanctionPo({
      kind: 'suspension',
      until: new Date('2026-11-25T00:00:00Z'),
      appealReceivedAt: new Date('2026-11-19T00:00:00Z'),
      appealOutcome: 'reverted',
      appealNote: 'Engano de pessoa.',
      appealDecidedAt: new Date('2026-11-20T00:00:00Z'),
    });
    const dto = toAccountSanctionDto({ ...decided, ...names, decidedByUsername: 'gabriel' });
    expect(dto.until).toBe('2026-11-25T00:00:00.000Z');
    expect(dto.appeal).toEqual({
      receivedAt: '2026-11-19T00:00:00.000Z',
      outcome: 'reverted',
      note: 'Engano de pessoa.',
      decidedBy: 'gabriel',
      decidedAt: '2026-11-20T00:00:00.000Z',
    });
  });

  it('an appeal that only arrived has no outcome yet', () => {
    const received = accountSanctionPo({ appealReceivedAt: new Date('2026-11-19T00:00:00Z') });
    const dto = toAccountSanctionDto({ ...received, ...names });
    expect(dto.appeal).toEqual({
      receivedAt: '2026-11-19T00:00:00.000Z',
      outcome: null,
      note: null,
      decidedBy: null,
      decidedAt: null,
    });
  });
});

describe('sanctionMailOf', () => {
  it.each([
    ['warning', 'Um aviso sobre a sua conta no Lorkarium'],
    ['content_removal', 'Removemos um conteúdo da sua conta no Lorkarium'],
    ['suspension', 'Sua conta no Lorkarium foi suspensa'],
    ['ban', 'Sua conta no Lorkarium foi excluída'],
  ] as const)('a %s gets "%s"', (kind, subject) => {
    const mail = sanctionMailOf(kind, {
      person: { to: 'caio@mesa.com', name: 'Caio', username: 'caio' },
      rule: 'spam',
      statement: 'x',
      until: null,
      publicUrl: 'https://mesa.example.com',
      siteUrl: 'https://lorkarium.example.com',
      replyTo: null,
    });
    expect(mail.subject).toBe(subject);
  });
});
