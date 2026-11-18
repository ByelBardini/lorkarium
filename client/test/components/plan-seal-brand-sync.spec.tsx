import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PLAN_SEAL_ICONS } from '@/components/plan-seal-icon-map';

// The site draws the sold plans from @lorkarium/brand/seals; the app keeps its own TSX icons. This
// spec keeps both drawings the same stroke for stroke.
const BRAND_SEALS = ['apoiador', 'narrador', 'lenda'] as const;
// Under jsdom `import.meta.url` is not a file: URL; the directory of the spec still is a path.
const SEALS_DIR = join(import.meta.dirname, '..', '..', '..', 'packages', 'brand', 'seals');

function strokesOf(svg: Element): string[] {
  return [...svg.querySelectorAll('path')].map(
    (path) => `${path.getAttribute('d')}|${path.getAttribute('stroke-opacity') ?? '1'}`,
  );
}

function brandSvgOf(kind: string): Element {
  const holder = document.createElement('div');
  holder.innerHTML = readFileSync(join(SEALS_DIR, `${kind}.svg`), 'utf8');
  const svg = holder.querySelector('svg');
  if (svg === null) throw new Error(`packages/brand/seals/${kind}.svg: expected an <svg> root`);
  return svg;
}

describe('the plan seals of @lorkarium/brand', () => {
  it.each(BRAND_SEALS)('%s draws the same strokes, grid and weight as the app icon', (kind) => {
    const Icon = PLAN_SEAL_ICONS[kind];
    const app = render(<Icon />).container.querySelector('svg');
    const brand = brandSvgOf(kind);

    expect(app).not.toBeNull();
    expect(strokesOf(brand)).toEqual(strokesOf(app as Element));
    expect(brand.getAttribute('viewBox')).toBe(app?.getAttribute('viewBox'));
    expect(brand.getAttribute('stroke-width')).toBe(app?.getAttribute('stroke-width'));
  });
});
