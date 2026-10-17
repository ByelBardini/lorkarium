import { CONDITION_ICONS } from '@lorkarium/contracts';
import { GraphicsContext } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { conditionIconSvg } from '@/lib/condition-icons';

describe('condition icons on the canvas', () => {
  it.each(CONDITION_ICONS)('PixiJS parses the %s markup into something with size', (icon) => {
    const context = new GraphicsContext().svg(conditionIconSvg(icon, '#b5654f'));
    expect(context.bounds.width).toBeGreaterThan(4);
    expect(context.bounds.height).toBeGreaterThan(4);
  });
});
