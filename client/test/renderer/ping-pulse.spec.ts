import { describe, expect, it } from 'vitest';
import { pingPulseAt } from '@/renderer/ping-pulse';

describe('pingPulseAt', () => {
  it('at 0 ms the ring has no radius and is opaque', () => {
    expect(pingPulseAt(0, false)).toEqual({ radius: 0, alpha: 1 });
  });

  it('at 750 ms the first pulse is at half the radius, half faded', () => {
    expect(pingPulseAt(750, false)).toEqual({ radius: 0.5, alpha: 0.5 });
  });

  it('at 1500 ms the second pulse starts over', () => {
    expect(pingPulseAt(1500, false)).toEqual({ radius: 0, alpha: 1 });
  });

  it.each([3000, 4200])('at %s ms the ping is over', (elapsed) => {
    expect(pingPulseAt(elapsed, false)).toBeNull();
  });

  it('with reduced motion the ring keeps its radius and fades from 1 to 0 over 3 s', () => {
    const samples = [0, 1500, 2250].map((elapsed) => pingPulseAt(elapsed, true));

    expect(samples).toEqual([
      { radius: 0.6, alpha: 1 },
      { radius: 0.6, alpha: 0.5 },
      { radius: 0.6, alpha: 0.25 },
    ]);
  });

  it('with reduced motion it is over at 3000 ms too', () => {
    expect(pingPulseAt(3000, true)).toBeNull();
  });
});
