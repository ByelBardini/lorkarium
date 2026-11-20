import { describe, expect, it } from 'vitest';
import {
  audienceLabel,
  paragraphsOf,
  progressLabel,
  segmentLabel,
  segmentOf,
  stateLabel,
} from '@/features/admin/broadcast-view';
import { mailBroadcast } from '../../support/broadcasts-api-fake';

const CONFIRMED = '2026-11-19T12:30:00.000Z';

describe('broadcast view', () => {
  it.each([
    ['all', 'all'],
    ['paid', 'paid'],
    ['plan:narrador', { plan: 'narrador' }],
  ] as const)('the choice %s is the segment %o', (choice, segment) => {
    expect(segmentOf(choice)).toEqual(segment);
  });

  it.each([
    ['all', 'Todas as contas ativas'],
    ['paid', 'Quem tem plano pago'],
    [{ plan: 'lenda' }, 'Quem paga o plano Lenda'],
  ] as const)('segment %o reads %s', (segment, label) => {
    expect(segmentLabel(segment)).toBe(label);
  });

  it.each([
    [1, 'Vai para 1 conta.'],
    [1300, 'Vai para 1.300 contas.'],
    [0, 'Vai para 0 contas.'],
  ])('an audience of %i reads %s', (audience, label) => {
    expect(audienceLabel(audience)).toBe(label);
  });

  it('a blank line splits the text into paragraphs and blank ones are dropped', () => {
    expect(paragraphsOf(' Um.\nainda um.\n\n  \n\nDois. ')).toEqual(['Um.\nainda um.', 'Dois.']);
  });

  it('a notice being sent shows the sent of the total and the failures', () => {
    const sending = mailBroadcast({ confirmedAt: CONFIRMED, total: 1300, sent: 1240, failed: 3 });
    expect(progressLabel(sending)).toBe('1.240 de 1.300 enviados · 3 falhas');
  });

  it('one failure and one skipped account read in the singular', () => {
    const done = mailBroadcast({
      confirmedAt: CONFIRMED,
      total: 3,
      sent: 1,
      failed: 1,
      skipped: 1,
    });
    expect(progressLabel(done)).toBe('1 de 3 enviados · 1 falha · 1 conta excluída');
  });

  it('a draft reads as not sent', () => {
    expect([progressLabel(mailBroadcast()), stateLabel(mailBroadcast())]).toEqual([
      'Rascunho, não enviado',
      'Rascunho',
    ]);
  });

  it('a finished notice shows the day it ended, in Brasília', () => {
    const finished = mailBroadcast({
      confirmedAt: CONFIRMED,
      total: 3,
      finishedAt: '2026-11-20T02:00:00.000Z',
    });
    expect(stateLabel(finished)).toBe('Concluído em 19/11/2026');
  });
});
