import { describe, expect, it } from 'vitest';
import {
  letterOf,
  letterPoOf,
  toMailBroadcastDto,
} from '../../../src/modules/broadcasts/broadcasts.mapper';
import type { MailBroadcastRow } from '../../../src/modules/broadcasts/mail-broadcasts.dao';

const CREATED = new Date('2026-11-19T12:00:00Z');
const CONFIRMED = new Date('2026-11-19T12:30:00Z');

function row(overrides: Partial<MailBroadcastRow> = {}): MailBroadcastRow {
  return {
    ...{ id: '6f1c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f', segment: { plan: 'lenda' } },
    ...{ subject: 'Preços', title: 'Novos preços', paragraphs: ['Texto.'], button: null },
    ...{ createdBy: null, createdAt: CREATED, testedAt: null, confirmedAt: null },
    ...{ finishedAt: null, total: null, sent: 0, failed: 0, skipped: 0 },
    ...overrides,
  };
}

describe('toMailBroadcastDto', () => {
  it('a confirmed notice carries its dates in ISO, the frozen total and the counts', () => {
    const dto = toMailBroadcastDto(
      row({
        confirmedAt: CONFIRMED,
        testedAt: CREATED,
        total: 40,
        sent: 37,
        failed: 2,
        skipped: 1,
      }),
    );
    expect(dto).toMatchObject({
      segment: { plan: 'lenda' },
      createdAt: '2026-11-19T12:00:00.000Z',
      testedAt: '2026-11-19T12:00:00.000Z',
      confirmedAt: '2026-11-19T12:30:00.000Z',
      finishedAt: null,
      total: 40,
      sent: 37,
      failed: 2,
      skipped: 1,
    });
  });

  it('a stored segment outside the contract is refused instead of reaching the client', () => {
    expect(() => toMailBroadcastDto(row({ segment: { plan: 'amigo_do_dono' } }))).toThrow();
  });
});

describe('letterPoOf', () => {
  it('a notice without a button keeps a null button column', () => {
    const content = { segment: 'all' as const, subject: 'A', title: 'B', paragraphs: ['C'] };
    expect(letterPoOf(content)).toEqual({ ...content, button: null });
  });
});

describe('letterOf', () => {
  it('keeps the text and the button of the notice for the e-mail', () => {
    const button = { label: 'Ver', href: 'https://lorkarium.com.br/planos' };
    expect(letterOf(row({ button }))).toEqual({
      subject: 'Preços',
      title: 'Novos preços',
      paragraphs: ['Texto.'],
      button,
    });
  });
});
