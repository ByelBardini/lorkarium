import type { ConditionColorDto, ConditionToneDto } from '@lorkarium/contracts';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConditionMark } from '@/features/combat/condition-marks';

const IMAGE_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

type MarkOptions = Readonly<{
  tone: ConditionToneDto;
  color?: ConditionColorDto | null;
  imageAssetId?: string | null;
}>;

function ringOf(options: MarkOptions): HTMLElement {
  const { container } = render(<ConditionMark icon="skull" {...options} />);
  const ring = container.querySelector('[data-condition-mark]');
  if (!(ring instanceof HTMLElement)) throw new Error('expected the ring of the mark');
  return ring;
}

function glyphIn(ring: Element): Element {
  const glyph = ring.querySelector('[data-icon="skull"]');
  if (!glyph) throw new Error('expected the skull glyph inside the ring');
  return glyph;
}

describe('ConditionMark', () => {
  it('a condition with an image shows it round and covering the ring, without the glyph', () => {
    const ring = ringOf({ tone: 'harm', imageAssetId: IMAGE_ID });
    const image = ring.querySelector('img');
    expect(image).toHaveAttribute('src', `/api/assets/${IMAGE_ID}`);
    expect(image).toHaveAttribute('alt', '');
    expect(image).toHaveClass('rounded-full', 'object-cover');
    expect(ring.querySelector('[data-icon]')).toBeNull();
  });

  it('the ring is a circle', () => {
    expect(ringOf({ tone: 'harm' })).toHaveClass('rounded-full');
  });

  it.each([
    ['an icon', null],
    ['an image', IMAGE_ID],
  ])('with a color and %s the ring is drawn inline in its hex', (_, imageAssetId) => {
    const ring = ringOf({ tone: 'harm', color: 'ember', imageAssetId });
    expect(ring).toHaveStyle({ borderColor: '#ec7a45' });
    expect(ring).not.toHaveClass('border-destructive');
  });

  it('with a color the glyph is painted inline in its hex, without the tone classes', () => {
    const glyph = glyphIn(ringOf({ tone: 'harm', color: 'ember' }));
    expect(glyph).toHaveStyle({ color: '#ec7a45' });
    expect(glyph).not.toHaveClass('text-destructive');
    expect(glyph).not.toHaveClass('text-primary');
  });

  it('a benefit with a color still takes the color, not the gold of its tone', () => {
    const glyph = glyphIn(ringOf({ tone: 'benefit', color: 'sky' }));
    expect(glyph).toHaveStyle({ color: '#5cbcee' });
    expect(glyph).not.toHaveClass('text-primary');
  });

  it.each([
    ['benefit', 'border-primary', 'text-primary'],
    ['harm', 'border-destructive', 'text-destructive'],
  ] as const)(
    'a %s condition without a color takes the ring %s and the glyph %s',
    (tone, ringClass, glyphClass) => {
      const ring = ringOf({ tone, color: null });
      expect(ring).toHaveClass(ringClass);
      expect(ring.getAttribute('style')).toBeNull();
      expect(glyphIn(ring)).toHaveClass(glyphClass);
    },
  );

  it('with the color left out it is painted by its tone too', () => {
    expect(ringOf({ tone: 'harm' })).toHaveClass('border-destructive');
  });

  it('an incapacitating condition with an image gets the ring twice as thick', () => {
    expect(ringOf({ tone: 'incapacitating', imageAssetId: IMAGE_ID })).toHaveClass('border-2');
    expect(ringOf({ tone: 'harm', imageAssetId: IMAGE_ID })).not.toHaveClass('border-2');
  });

  it('an incapacitating condition with an icon is a full disc in its color with a dark glyph', () => {
    const ring = ringOf({ tone: 'incapacitating', color: 'sky' });
    expect(ring).toHaveStyle({ backgroundColor: '#5cbcee' });
    expect(glyphIn(ring)).toHaveClass('text-background');
    expect(glyphIn(ring).getAttribute('style')).toBeNull();
  });

  it('an incapacitating condition without a color is a full disc in the error color', () => {
    const ring = ringOf({ tone: 'incapacitating', color: null });
    expect(ring).toHaveClass('bg-destructive');
    expect(glyphIn(ring)).toHaveClass('text-background');
  });

  it('an image that fails to load gives way to the glyph of the icon', () => {
    const ring = ringOf({ tone: 'harm', imageAssetId: IMAGE_ID });
    const image = ring.querySelector('img');
    if (!image) throw new Error('expected the image before it fails');
    fireEvent.error(image);
    expect(ring.querySelector('img')).toBeNull();
    expect(glyphIn(ring)).toHaveClass('text-destructive');
  });
});
