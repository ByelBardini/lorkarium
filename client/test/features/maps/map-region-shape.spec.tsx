import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MapRegionDto } from '@lorkarium/contracts';
import { MapRegionShape } from '@/features/maps/map-region-shape';
import { mapRegion, pinRegion } from '../../support/library-map-fixtures';

const IMAGE = { width: 2000, height: 1000 };

function renderShape(region: MapRegionDto, zoom = 1): HTMLElement {
  const { container } = render(
    <svg>
      <MapRegionShape region={region} image={IMAGE} zoom={zoom} onClick={() => undefined} />
    </svg>,
  );
  return container;
}

function radiiOf(container: HTMLElement): number[] {
  return [...container.querySelectorAll('circle')].map((circle) =>
    Number(circle.getAttribute('r')),
  );
}

describe('the marker of a pin', () => {
  it('draws the icon the pin has', () => {
    const container = renderShape(pinRegion({ icon: 'castle' }));
    expect(container.querySelector('[data-pin-icon="castle"] svg')).toBeInTheDocument();
  });

  it('a pin that never chose one has the plain marker', () => {
    const container = renderShape(pinRegion());
    expect(container.querySelector('[data-pin-icon="pin"] svg')).toBeInTheDocument();
  });

  it('a polygon has no icon, whatever the field says', () => {
    const container = renderShape(mapRegion({ icon: 'castle' }));
    expect(container.querySelector('[data-pin-icon]')).not.toBeInTheDocument();
  });

  it('the click area is bigger than the disc it surrounds', () => {
    const [hit, disc] = radiiOf(renderShape(pinRegion()));
    expect(hit).toBeGreaterThan(disc ?? Infinity);
  });

  it('keeps its size on screen at any zoom', () => {
    const [, near] = radiiOf(renderShape(pinRegion(), 2));
    const [, far] = radiiOf(renderShape(pinRegion(), 0.5));
    expect((near ?? 0) * 2).toBeCloseTo((far ?? 0) * 0.5);
  });

  it('the icon reads on a pale color', () => {
    const container = renderShape(pinRegion({ color: '#f5f0c0' }));
    expect(container.querySelector('[data-pin-icon] svg')).toHaveAttribute('stroke', '#1a1a1a');
  });

  it('the icon reads on a dark color', () => {
    const container = renderShape(pinRegion({ color: '#1a2030' }));
    expect(container.querySelector('[data-pin-icon] svg')).toHaveAttribute('stroke', '#ffffff');
  });
});
