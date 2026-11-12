import { describe, expect, it } from 'vitest';
import { planGain, planGridColumns } from '@/features/account/plan-grid-columns';

type Holder = Parameters<typeof planGridColumns>[0];

const names = (holder: Holder): string[] => planGridColumns(holder).map((column) => column.name);

describe('planGridColumns', () => {
  it('a Lenda sees the four open plans, its own marked, and no Amigo do Dono', () => {
    const columns = planGridColumns({ plan: 'lenda', admin: false, lorkariumOwner: false });
    expect(columns.map((c) => c.name)).toEqual(['Grátis', 'Apoiador', 'Narrador', 'Lenda']);
    expect(columns.filter((c) => c.current).map((c) => c.name)).toEqual(['Lenda']);
  });

  it('an Amigo do Dono sees its own column at the end', () => {
    expect(names({ plan: 'amigo_do_dono', admin: false, lorkariumOwner: false }).at(-1)).toBe(
      'Amigo do Dono',
    );
  });

  it('the Dono and an admin see "Limites especiais" under their seal, never Amigo do Dono', () => {
    const owner = planGridColumns({ plan: 'free', admin: false, lorkariumOwner: true });
    expect(owner.at(-1)).toMatchObject({ name: 'Limites especiais', current: true });
    expect(owner.at(-1)?.seal?.kind).toBe('lorkarium_owner');
    expect(owner.filter((c) => c.current)).toHaveLength(1);
    expect(names({ plan: 'amigo_do_dono', admin: true, lorkariumOwner: false })).not.toContain(
      'Amigo do Dono',
    );
  });
});

describe('planGain', () => {
  it.each([
    [5, 20, '×4'],
    [10, 15, '×1,5'],
    [0, 5, '+5'],
    [5, 5, null],
    [20, 10, null],
    [null, 5, null],
    [5, null, null],
  ] as const)('planGain(%s, %s) is %s', (before, after, gain) => {
    expect(planGain(before, after)).toBe(gain);
  });
});
