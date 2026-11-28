import { PLAN_LIMITS } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  auraCell,
  campaignsUsageLabel,
  countCell,
  PLAN_GRID_ROWS,
  storageUsageLabel,
} from '@/features/account/plan-grid';

const MEBIBYTE = 1024 * 1024;

describe('plan grid texts', () => {
  it.each([
    [1, 1, '1 de 1 mesa'],
    [0, 5, '0 de 5 mesas'],
    [1, null, '1 mesa'],
    [3, null, '3 mesas'],
  ] as const)('campaignsUsageLabel(%i, %s) is %s', (used, limit, label) => {
    expect(campaignsUsageLabel(used, limit)).toBe(label);
  });

  it('storageUsageLabel shows the ceiling, or only the size without one', () => {
    expect(storageUsageLabel(40 * MEBIBYTE, 100 * MEBIBYTE)).toBe('40 MB de 100 MB');
    expect(storageUsageLabel(40 * MEBIBYTE, null)).toBe('40 MB');
  });

  it('countCell: fair use is "ilimitado", no ceiling is "sem limite", big numbers in pt-BR', () => {
    expect(countCell('scenes', PLAN_LIMITS.lenda)).toBe('ilimitado');
    expect(countCell('players', PLAN_LIMITS.lenda)).toBe('20');
    expect(countCell('scenes', PLAN_LIMITS.amigo_do_dono)).toBe('sem limite');
    expect(countCell('storage', PLAN_LIMITS.free)).toBe('100 MB');
    expect(countCell('npcSheets', PLAN_LIMITS.narrador)).toBe('30');
  });

  it('auraCell names the kinds of each plan', () => {
    expect(auraCell(PLAN_LIMITS.free)).toBe('só cor');
    expect(auraCell(PLAN_LIMITS.narrador)).toBe('só cor');
    expect(auraCell(PLAN_LIMITS.lenda)).toBe('cor, efeito e imagem');
  });

  it('the grid has one row per counted resource plus the features, with unique labels', () => {
    const labels = PLAN_GRID_ROWS.map((row) => row.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain('Duplicar grid');
    expect(
      PLAN_GRID_ROWS.find((row) => row.label === 'Duplicar grid')?.cellOf(PLAN_LIMITS.free),
    ).toBe('não');
  });

  it('the account customizations row says yes from the Apoiador up, no on Grátis', () => {
    const row = PLAN_GRID_ROWS.find((line) => line.label.startsWith('Personalizações da conta'));
    expect(row?.cellOf(PLAN_LIMITS.free)).toBe('não');
    expect(row?.cellOf(PLAN_LIMITS.apoiador)).toBe('sim');
    expect(row?.cellOf(PLAN_LIMITS.narrador)).toBe('sim');
  });

  it.each([
    ['Scripts na ficha', 'não', 'não', 'sim', 'sim'],
    ['Arte animada da mesa', 'não', 'não', 'não', 'sim'],
    ['Banner de perfil', 'não', 'não', 'não', 'sim'],
    ['Rolagens salvas por pessoa', '3', '15', '15', '50'],
    ['Pastas de rolagens por pessoa', '0', '5', '5', '50'],
    ['Tokens salvos por pessoa', '0', '5', '20', '50'],
    ['Pastas de tokens salvos por pessoa', '0', '2', '5', '20'],
    ['Emojis personalizados', '0', '10', '25', '50'],
    ['Ciclos de rodada por mesa', '1', '1', '3', '10'],
    ['Fases por ciclo de rodada', '3', '3', '6', '12'],
    ['Fase de ciclo com imagem própria', 'não', 'não', 'sim', 'sim'],
    ['Emoji personalizado animado (GIF)', 'não', 'não', 'não', 'sim'],
  ] as const)(
    'the "%s" row reads %s / %s / %s / %s on Grátis, Apoiador, Narrador and Lenda',
    (label, free, apoiador, narrador, lenda) => {
      const row = PLAN_GRID_ROWS.find((line) => line.label === label);
      const cells = [
        PLAN_LIMITS.free,
        PLAN_LIMITS.apoiador,
        PLAN_LIMITS.narrador,
        PLAN_LIMITS.lenda,
      ];
      expect(cells.map((limits) => row?.cellOf(limits))).toEqual([free, apoiador, narrador, lenda]);
    },
  );

  it('the marks come before the numbers', () => {
    const labels = PLAN_GRID_ROWS.map((row) => row.label);
    expect(labels.indexOf('Duplicar grid')).toBeLessThan(labels.indexOf('Mesas como dono'));
  });

  it('the saved rolls rows compare by the person’s ceilings: the Apoiador above Grátis', () => {
    const row = PLAN_GRID_ROWS.find((line) => line.label === 'Rolagens salvas por pessoa');
    expect([PLAN_LIMITS.free, PLAN_LIMITS.apoiador].map((l) => row?.amountOf?.(l))).toEqual([
      3, 15,
    ]);
  });

  it('the Apoiador column keeps the table limits of Grátis', () => {
    const personal = [
      'Personalizações',
      'Rolagens salvas',
      'Pastas de rolagens',
      'Tokens salvos',
      'Pastas de tokens salvos',
      'Emojis personalizados',
    ];
    const tableRows = PLAN_GRID_ROWS.filter(
      (line) => !personal.some((start) => line.label.startsWith(start)),
    );
    for (const row of tableRows)
      expect(row.cellOf(PLAN_LIMITS.apoiador)).toBe(row.cellOf(PLAN_LIMITS.free));
  });
});
