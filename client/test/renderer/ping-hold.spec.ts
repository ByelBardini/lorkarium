import { describe, expect, it } from 'vitest';
import { isAltPing, movePingHold, pingHoldDue, startPingHold } from '@/renderer/ping-hold';

const T0 = 10_000;

describe('ping hold', () => {
  it('held still for 499 ms is not a ping yet', () => {
    expect(pingHoldDue(startPingHold({ x: 50, y: 50 }, T0), T0 + 499)).toBe(false);
  });

  it('held still for 500 ms is a ping', () => {
    expect(pingHoldDue(startPingHold({ x: 50, y: 50 }, T0), T0 + 500)).toBe(true);
  });

  it('moving 3 px keeps the hold', () => {
    const hold = movePingHold(startPingHold({ x: 50, y: 50 }, T0), { x: 53, y: 50 });

    expect(pingHoldDue(hold, T0 + 500)).toBe(true);
  });

  it('moving 4 px cancels it, and coming back does not restore it', () => {
    const away = movePingHold(startPingHold({ x: 50, y: 50 }, T0), { x: 50, y: 54 });
    const back = movePingHold(away, { x: 50, y: 50 });

    expect(pingHoldDue(back, T0 + 900)).toBe(false);
  });
});

describe('isAltPing', () => {
  const press = { button: 0, altKey: true, ctrlKey: false, metaKey: false };

  it('the primary button with Alt is a ping', () => {
    expect(isAltPing(press)).toBe(true);
  });

  it.each([
    ['without Alt', { altKey: false }],
    ['with Ctrl too', { ctrlKey: true }],
    ['with ⌘ too', { metaKey: true }],
    ['on the right button', { button: 2 }],
  ])('a press %s is not', (_case, change) => {
    expect(isAltPing({ ...press, ...change })).toBe(false);
  });
});
