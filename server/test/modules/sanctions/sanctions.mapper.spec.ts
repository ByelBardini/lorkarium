import { describe, expect, it } from 'vitest';
import type { SanctionRule } from '@lorkarium/contracts';
import type { SanctionMailInput } from '../../../src/modules/sanctions/sanction-mail.mapper';
import {
  sanctionMailOf,
  toAccountSanctionDto,
  toNewAccountSanctionPo,
} from '../../../src/modules/sanctions/sanctions.mapper';
import { accountSanctionPo } from '../../support/sanctions-factories';

const names = { issuedByUsername: 'fernanda', decidedByUsername: null };
const NOW = new Date('2026-11-19T12:00:00Z');
const CAIO = 'ca100000-0000-4000-8000-000000000002';
const ADMIN = 'ad000000-0000-4000-8000-000000000001';
const REPORT = '7e700000-0000-4000-8000-000000000003';

describe('toAccountSanctionDto', () => {
  it('a measure without an appeal goes out with appeal null and the @ of who applied it', () => {
    const dto = toAccountSanctionDto({ ...accountSanctionPo(), ...names });
    expect(dto).toMatchObject({
      kind: 'warning',
      until: null,
      issuedBy: 'fernanda',
      issuedAt: '2026-11-18T12:00:00.000Z',
      deletionDueAt: null,
      appeal: null,
    });
  });

  it('a ban goes out with the date its deletion is due', () => {
    const due = new Date('2026-12-03T12:00:00Z');
    const ban = accountSanctionPo({ kind: 'ban', deletionDueAt: due });
    expect(toAccountSanctionDto({ ...ban, ...names }).deletionDueAt).toBe(
      '2026-12-03T12:00:00.000Z',
    );
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
    ['ban', 'Sua conta no Lorkarium será excluída'],
  ] as const)('a %s gets "%s"', (kind, subject) => {
    expect(sanctionMailOf(kind, mailInput('spam')).subject).toBe(subject);
  });

  it('a ban for the minimum age gets the age notice instead', () => {
    expect(sanctionMailOf('ban', mailInput('minimum_age')).subject).toBe(
      'Sua conta no Lorkarium será excluída pela idade mínima',
    );
  });
});

function mailInput(rule: SanctionRule): SanctionMailInput {
  return {
    person: { to: 'caio@mesa.com', name: 'Caio', username: 'caio' },
    rule,
    statement: 'x',
    until: null,
    deletionDueAt: new Date('2026-12-04T12:00:00Z'),
    publicUrl: 'https://mesa.example.com',
    siteUrl: 'https://lorkarium.example.com',
    replyTo: null,
  };
}

describe('toNewAccountSanctionPo', () => {
  const base = { userId: CAIO, issuedBy: ADMIN, now: NOW, until: null };

  it('a ban gets its deletion 15 days ahead and whether the shared tables go along', () => {
    const request = {
      kind: 'ban',
      rule: 'harassment',
      statement: 'x',
      includeSharedCampaigns: true,
    } as const;
    expect(toNewAccountSanctionPo({ ...base, request })).toMatchObject({
      kind: 'ban',
      deletionDueAt: new Date('2026-12-04T12:00:00Z'),
      deleteSharedCampaigns: true,
      issuedAt: NOW,
      reportId: null,
    });
  });

  it('another kind has no deletion and never takes tables', () => {
    const request = { kind: 'warning', rule: 'spam', statement: 'x', reportId: REPORT } as const;
    expect(toNewAccountSanctionPo({ ...base, request })).toMatchObject({
      deletionDueAt: null,
      deleteSharedCampaigns: false,
      reportId: REPORT,
    });
  });
});
