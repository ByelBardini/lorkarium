import { describe, expect, it } from 'vitest';
import {
  appealLabel,
  measureNotice,
  previewLines,
  ruleLabel,
  ruleOptionLabel,
} from '@/features/admin/sanction-messages';

describe('sanction messages', () => {
  it('a rule is named by its title and section, in the list and in the history', () => {
    expect(ruleOptionLabel('harassment')).toBe('§2 Respeito às pessoas');
    expect(ruleLabel('spam')).toBe('Spam e divulgação (§9)');
  });

  it('a warning preview has no deadline line; a suspension without an end says "sem prazo"', () => {
    const warning = previewLines({ kind: 'warning', rule: 'spam', statement: ' x ', until: null });
    expect(warning).toEqual([
      'Medida: Aviso',
      'Regra: Spam e divulgação (§9 da Política de uso)',
      'O motivo: x',
    ]);
    const suspension = previewLines({
      kind: 'suspension',
      rule: 'spam',
      statement: 'x',
      until: null,
    });
    expect(suspension).toContain('Prazo: sem prazo');
    expect(suspension[0]).toBe('Medida: Suspensão temporária');
  });

  it.each([
    ['warning', '@bia recebeu um aviso.'],
    ['content_removal', 'A remoção de conteúdo de @bia foi registrada.'],
    ['suspension', 'O acesso de @bia foi suspenso.'],
    ['ban', 'A conta @bia foi excluída.'],
  ] as const)('the notice of a %s is "%s"', (kind, notice) => {
    expect(measureNotice(kind, 'bia')).toBe(notice);
  });

  it('the appeal reads none, received or decided with who decided', () => {
    expect(appealLabel(null)).toBe('Sem contestação');
    const received = new Date(2026, 10, 19, 12).toISOString();
    const base = { receivedAt: received, note: null, decidedBy: null, decidedAt: null };
    expect(appealLabel({ ...base, outcome: null })).toBe('Contestação recebida em 19/11/2026');
    const decided = {
      ...base,
      outcome: 'upheld',
      note: 'Mantida.',
      decidedBy: 'lucas',
      decidedAt: received,
    } as const;
    expect(appealLabel(decided)).toBe('Contestação mantida em 19/11/2026 por @lucas');
  });
});
