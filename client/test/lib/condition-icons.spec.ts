import { CONDITION_ICONS } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { CONDITION_ICON_ENTRIES, conditionIconSvg } from '@/lib/condition-icons';

describe('condition icons', () => {
  it('every icon of the contract has a glyph and a distinct name', () => {
    const labels = CONDITION_ICONS.map((icon) => CONDITION_ICON_ENTRIES[icon].label);
    expect(new Set(labels).size).toBe(CONDITION_ICONS.length);
  });

  it('the canvas markup is an SVG stroked in the color asked for', () => {
    const markup = conditionIconSvg('skull', '#b5654f');
    expect(markup).toMatch(/^<svg[^>]*stroke="#b5654f"/);
    expect(markup).toContain('<path');
  });

  it('two colors of one icon are two markups', () => {
    expect(conditionIconSvg('ghost', '#c5a46d')).not.toBe(conditionIconSvg('ghost', '#b5654f'));
  });
});
