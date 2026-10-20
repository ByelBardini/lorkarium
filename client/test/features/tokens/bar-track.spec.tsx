import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BarTrack } from '@/features/tokens/bar-track';
import { barFill } from '@/lib/bar-display';

function fillOf(container: HTMLElement): HTMLElement {
  const fill = container.querySelector<HTMLElement>('span > span');
  if (!fill) throw new Error('the track has no fill');
  return fill;
}

describe('BarTrack', () => {
  it('32 of 45 fills the track to 71.1%', () => {
    const { container } = render(
      <BarTrack fill={barFill({ current: 32, max: 45 })} color="ember" />,
    );

    expect(fillOf(container).style.width).toMatch(/^71\.1/);
    expect(container.querySelector('[data-bar-excess]')).toBeNull();
  });

  it('a value below zero draws the crimson excess from the left', () => {
    const { container } = render(
      <BarTrack fill={barFill({ current: -10, max: 40 })} color="ember" />,
    );

    const excess = container.querySelector<HTMLElement>('[data-bar-excess="negative"]');
    expect(excess?.style.width).toBe('25%');
  });

  it('a value above the maximum draws the bone excess', () => {
    const { container } = render(
      <BarTrack fill={barFill({ current: 50, max: 40 })} color="gold" />,
    );

    expect(container.querySelector('[data-bar-excess="over"]')).toBeInTheDocument();
  });
});
