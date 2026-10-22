import { beforeEach, describe, expect, it } from 'vitest';
import { TABLE_IDLE_MS, createIdleWatch, type IdleWatch } from '@/lib/idle-watch';
import { InteractionClockFake } from '../support/interaction-clock-fake';

const MINUTE = 60_000;

describe('createIdleWatch', () => {
  let clock: InteractionClockFake;
  let changes: boolean[];
  let watch: IdleWatch;

  beforeEach(() => {
    clock = new InteractionClockFake();
    changes = [];
    watch = createIdleWatch({
      clock,
      idleMs: TABLE_IDLE_MS,
      onChange: (away) => changes.push(away),
    });
  });

  it('the table counts as idle after 10 minutes', () => {
    expect(TABLE_IDLE_MS).toBe(10 * MINUTE);
  });

  it('10 minutes without a touch say away', () => {
    clock.advance(10 * MINUTE);

    expect(changes).toEqual([true]);
  });

  it('a touch after going away says back', () => {
    clock.advance(10 * MINUTE);

    watch.touch();

    expect(changes).toEqual([true, false]);
  });

  it('a touch at 9:59 starts the count again', () => {
    clock.advance(10 * MINUTE - 1000);
    watch.touch();

    clock.advance(10 * MINUTE - 1000);
    expect(changes).toEqual([]);
    clock.advance(1000);
    expect(changes).toEqual([true]);
  });

  it('many touches in a row while active say nothing', () => {
    for (let second = 0; second < 30; second += 1) {
      clock.advance(1000);
      watch.touch();
    }

    expect(changes).toEqual([]);
  });

  it('many touches after coming back say back once', () => {
    clock.advance(10 * MINUTE);

    watch.touch();
    watch.touch();

    expect(changes).toEqual([true, false]);
  });

  it('dispose cancels the count', () => {
    watch.dispose();

    clock.advance(20 * MINUTE);

    expect(changes).toEqual([]);
  });
});
