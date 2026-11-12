import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PLAN_SEAL_ICONS } from '@/components/plan-seal-icon-map';
import type { PlanSealKind } from '@/lib/plan-seal';

const KINDS = Object.keys(PLAN_SEAL_ICONS) as PlanSealKind[];

describe('PLAN_SEAL_ICONS', () => {
  it('has an icon for every seal kind', () => {
    expect([...KINDS].sort()).toEqual(
      ['admin', 'amigo_do_dono', 'apoiador', 'lenda', 'lorkarium_owner', 'narrador'].sort(),
    );
  });

  it.each(KINDS)(
    '%s is a hidden stroke drawing in the current color, sized by className',
    (kind) => {
      const Icon = PLAN_SEAL_ICONS[kind];
      const { container } = render(<Icon className="size-3" />);

      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('fill', 'none');
      expect(svg).toHaveAttribute('stroke', 'currentColor');
      expect(svg).toHaveAttribute('stroke-linejoin', 'round');
      expect(svg).toHaveClass('size-3');
    },
  );

  it('the logo of the Dono keeps its 120 grid with a thinner stroke; the others are 24 at 2', () => {
    const { container } = render(
      <>
        {KINDS.map((kind) => {
          const Icon = PLAN_SEAL_ICONS[kind];
          return <Icon key={kind} />;
        })}
      </>,
    );

    const grids = [...container.querySelectorAll('svg')].map((svg) => [
      svg.getAttribute('viewBox'),
      svg.getAttribute('stroke-width'),
    ]);
    const owner = KINDS.indexOf('lorkarium_owner');
    expect(grids[owner]).toEqual(['0 0 120 120', '7.5']);
    expect(grids.filter((_, index) => index !== owner)).toEqual(
      Array.from({ length: KINDS.length - 1 }, () => ['0 0 24 24', '2']),
    );
  });
});
