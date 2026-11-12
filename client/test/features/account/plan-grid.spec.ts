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
    expect(countCell('npcSheets', PLAN_LIMITS.narrador)).toBe('50');
  });

  it('auraCell names the kinds of each plan', () => {
    expect(auraCell(PLAN_LIMITS.free)).toBe('só cor');
    expect(auraCell(PLAN_LIMITS.narrador)).toBe('cor, efeito e imagem');
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

  it('the Apoiador column keeps the table limits of Grátis', () => {
    const tableRows = PLAN_GRID_ROWS.filter((line) => !line.label.startsWith('Personalizações'));
    for (const row of tableRows)
      expect(row.cellOf(PLAN_LIMITS.apoiador)).toBe(row.cellOf(PLAN_LIMITS.free));
  });
});
