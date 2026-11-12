import { PLAN_COUNT_RESOURCES, PLAN_FEATURE_RESOURCES } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { amountText, planLimitMessage } from '@/lib/plan-limit-message';

describe('planLimitMessage', () => {
  it('names the ceiling of the table owner plan and the plan that frees more', () => {
    expect(planLimitMessage({ resource: 'scenes', limit: 5, plan: 'free' })).toBe(
      'Esta mesa usa o plano Grátis, que permite até 5 grids. O Narrador libera 20.',
    );
  });

  it('points a Narrador table at Lenda, with its article', () => {
    expect(planLimitMessage({ resource: 'lights', limit: 50, plan: 'narrador' })).toBe(
      'Esta mesa usa o plano Narrador, que permite até 50 luzes por cena. A Lenda libera 100.',
    );
  });

  it('skips a plan above that frees no more (bars are 8 from Narrador on)', () => {
    expect(planLimitMessage({ resource: 'tokenBars', limit: 2, plan: 'free' })).toBe(
      'Esta mesa usa o plano Grátis, que permite até 2 barras por token. O Narrador libera 8.',
    );
  });

  it('names no plan above when the next one has the same ceiling (Lenda also has 8 bars)', () => {
    expect(planLimitMessage({ resource: 'tokenBars', limit: 8, plan: 'narrador' })).toBe(
      'Esta mesa usa o plano Narrador, que permite até 8 barras por token.',
    );
  });

  it('speaks of the person own plan for the tables they own, in the singular at 1', () => {
    expect(planLimitMessage({ resource: 'campaigns', limit: 1, plan: 'free' })).toBe(
      'Seu plano Grátis permite até 1 mesa como dono. O Narrador libera 5.',
    );
  });

  it('writes storage in MB and GB', () => {
    expect(planLimitMessage({ resource: 'storage', limit: 100 * 1024 ** 2, plan: 'free' })).toBe(
      'Esta mesa usa o plano Grátis, que permite até 100 MB de arquivos. O Narrador libera 2 GB.',
    );
  });

  it('says a feature the plan lacks is in the paid plans', () => {
    expect(planLimitMessage({ resource: 'auraKind', limit: 0, plan: 'free' })).toBe(
      'Aura com efeito ou imagem está nos planos pagos.',
    );
  });

  it('says a ceiling of 0 is a resource the plan lacks, not "até 0"', () => {
    expect(planLimitMessage({ resource: 'patrols', limit: 0, plan: 'free' })).toBe(
      'Patrulha está nos planos pagos.',
    );
  });

  it('tells Lenda its fair use, with no plan above', () => {
    expect(planLimitMessage({ resource: 'scenes', limit: 500, plan: 'lenda' })).toBe(
      'Esta mesa chegou ao limite de uso justo (500 grids).',
    );
  });

  it('names no plan above Lenda for a ceiling outside fair use', () => {
    expect(planLimitMessage({ resource: 'players', limit: 20, plan: 'lenda' })).toBe(
      'Esta mesa usa o plano Lenda, que permite até 20 jogadores.',
    );
  });

  it('never offers Amigo do Dono, which is given and not bought', () => {
    expect(planLimitMessage({ resource: 'lights', limit: 100, plan: 'lenda' })).not.toContain(
      'Amigo',
    );
  });

  it('an Apoiador table points at the Narrador, never at the Apoiador', () => {
    expect(planLimitMessage({ resource: 'scenes', limit: 5, plan: 'apoiador' })).toBe(
      'Esta mesa usa o plano Apoiador, que permite até 5 grids. O Narrador libera 20.',
    );
    expect(planLimitMessage({ resource: 'campaigns', limit: 1, plan: 'free' })).not.toContain(
      'O Apoiador',
    );
  });

  it('has a sentence for every resource of the contract', () => {
    for (const resource of [...PLAN_COUNT_RESOURCES, ...PLAN_FEATURE_RESOURCES]) {
      expect(planLimitMessage({ resource, limit: 0, plan: 'free' })).toMatch(/planos pagos\.$/);
    }
  });
});

describe('amountText', () => {
  it('uses the singular for one', () => {
    expect(amountText('lights', 1)).toBe('1 luz por cena');
  });
});
