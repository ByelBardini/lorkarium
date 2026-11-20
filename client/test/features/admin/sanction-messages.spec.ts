import { describe, expect, it } from 'vitest';
import {
  appealLabel,
  banConsequence,
  banNotice,
  deletionLabel,
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
  ] as const)('the notice of a %s is "%s"', (kind, notice) => {
    expect(measureNotice(kind, 'bia')).toBe(notice);
  });

  it('the notice of a ban says the access is suspended and when the account goes', () => {
    const due = new Date(2026, 11, 5, 12).toISOString();
    expect(banNotice('bia', due)).toBe(
      'O acesso de @bia foi suspenso e a conta será excluída em 05/12/2026.',
    );
  });

  it('a ban for the minimum age keeps no e-mail out and asks for the refund', () => {
    expect(banConsequence('minimum_age')).toContain('O e-mail dela não é bloqueado');
    expect(banConsequence('minimum_age')).toContain('reembolse o valor integral em Cobrança');
    expect(banConsequence('harassment')).toContain('não pode criar outra conta por 5 anos');
  });

  it("a ban's deletion reads its date, or cancelled once reverted", () => {
    expect(deletionLabel(new Date(2026, 11, 5, 12).toISOString())).toBe('Exclusão em 05/12/2026');
    expect(deletionLabel(null)).toBe('Exclusão cancelada');
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
