import type { ConditionColorDto, ConditionToneDto } from '@lorkarium/contracts';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConditionMark } from '@/features/combat/condition-marks';

function markOf(tone: ConditionToneDto, color?: ConditionColorDto | null): Element {
  const { container } = render(<ConditionMark icon="skull" tone={tone} color={color} />);
  const glyph = container.querySelector('[data-icon="skull"]');
  if (!glyph) throw new Error('expected the skull glyph to be drawn');
  return glyph;
}

describe('ConditionMark', () => {
  it('with a color the glyph is painted inline in its hex, without the tone classes', () => {
    const glyph = markOf('harm', 'ember');
    expect(glyph).toHaveStyle({ color: '#ec7a45' });
    expect(glyph).not.toHaveClass('text-destructive');
    expect(glyph).not.toHaveClass('text-primary');
  });

  it('a benefit with a color still takes the color, not the gold of its tone', () => {
    const glyph = markOf('benefit', 'sky');
    expect(glyph).toHaveStyle({ color: '#5cbcee' });
    expect(glyph).not.toHaveClass('text-primary');
  });

  it.each([
    ['benefit', 'text-primary'],
    ['harm', 'text-destructive'],
    ['incapacitating', 'text-destructive'],
  ] as const)('a %s condition without a color takes the class %s', (tone, className) => {
    const glyph = markOf(tone, null);
    expect(glyph).toHaveClass(className);
    expect(glyph.getAttribute('style')).toBeNull();
  });

  it('with the color left out it is painted by its tone too', () => {
    expect(markOf('harm')).toHaveClass('text-destructive');
  });
});
