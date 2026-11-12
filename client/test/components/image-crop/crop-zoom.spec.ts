import { describe, expect, it } from 'vitest';
import { cropZoomText, steppedCropZoom } from '@/components/image-crop/crop-zoom';

describe('steppedCropZoom', () => {
  it('one step in from 1.1 lands on 1.2 exactly, with no floating drift', () => {
    expect(steppedCropZoom(1.1, 'in')).toBe(1.2);
  });

  it('one step out from 1.5 lands on 1.4', () => {
    expect(steppedCropZoom(1.5, 'out')).toBe(1.4);
  });

  it('in past 3× stays at 3×', () => {
    expect(steppedCropZoom(2.95, 'in')).toBe(3);
  });

  it('out below 1× stays at 1×', () => {
    expect(steppedCropZoom(1, 'out')).toBe(1);
  });
});

describe('cropZoomText', () => {
  it.each([
    [1, '1×'],
    [1.5, '1,5×'],
    [2.25, '2,3×'],
  ])('%s reads as "%s"', (zoom, text) => {
    expect(cropZoomText(zoom)).toBe(text);
  });
});
