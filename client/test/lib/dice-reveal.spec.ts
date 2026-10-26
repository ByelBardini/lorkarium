import { describe, expect, it } from 'vitest';
import {
  DICE_NOTICE_MS,
  isNoticeLive,
  latestRevealedOf,
  nextRevealAtOf,
  type RevealEntry,
} from '@/lib/dice-reveal';

type Entry = RevealEntry & Readonly<{ name: string }>;

function rolled(name: string, revealAtMs: number): Entry {
  return { kind: 'rolled', revealAtMs, name };
}

function secret(name: string, revealAtMs: number): Entry {
  return { kind: 'secret', revealAtMs, name };
}

describe('nextRevealAtOf', () => {
  it('is the soonest revealAtMs after now, whatever the order of the entries', () => {
    const entries = [rolled('a', 5000), rolled('b', 1000), rolled('c', 3000)];
    expect(nextRevealAtOf(entries, 2000)).toBe(3000);
  });

  it('a secret notice also has a reveal to wait for', () => {
    expect(nextRevealAtOf([secret('a', 800)], 0)).toBe(800);
  });

  it('an entry revealing exactly now is not waited for', () => {
    expect(nextRevealAtOf([rolled('a', 2000)], 2000)).toBeNull();
  });

  it('with a delay it is the soonest revealAtMs + delay after now: when a notice ends', () => {
    const entries = [rolled('a', 1000), rolled('b', 3000)];
    expect(nextRevealAtOf(entries, 4500, DICE_NOTICE_MS)).toBe(5000);
    expect(nextRevealAtOf(entries, 7000, DICE_NOTICE_MS)).toBeNull();
  });

  it('nothing left to reveal is null', () => {
    expect(nextRevealAtOf([rolled('a', 1000)], 2000)).toBeNull();
    expect(nextRevealAtOf([], 0)).toBeNull();
  });
});

describe('latestRevealedOf', () => {
  it('is the roll revealed last among those revealed since it was shown', () => {
    const entries = [rolled('late', 3000), rolled('early', 1500), rolled('waiting', 9000)];
    expect(latestRevealedOf(entries, 4000, 1000)?.name).toBe('late');
  });

  it('a roll still rolling is not revealed yet', () => {
    expect(latestRevealedOf([rolled('a', 3000)], 2999, 0)).toBeNull();
  });

  it('a roll revealing exactly now is revealed', () => {
    expect(latestRevealedOf([rolled('a', 3000)], 3000, 0)?.name).toBe('a');
  });

  it('a secret notice is never the revealed roll', () => {
    expect(latestRevealedOf([rolled('a', 1500), secret('b', 2000)], 4000, 0)?.name).toBe('a');
    expect(latestRevealedOf([secret('b', 2000)], 4000, 0)).toBeNull();
  });

  it('a roll already revealed when it was shown (an F5) never is', () => {
    expect(latestRevealedOf([rolled('a', 1000)], 60_000, 60_000)).toBeNull();
    expect(latestRevealedOf([rolled('a', 1000)], 60_000, 1000)).toBeNull();
  });
});

describe('isNoticeLive', () => {
  it('lasts DICE_NOTICE_MS (4 s) from the reveal', () => {
    expect(DICE_NOTICE_MS).toBe(4000);
    expect(isNoticeLive(rolled('a', 2400), 2400)).toBe(true);
    expect(isNoticeLive(rolled('a', 2400), 6399)).toBe(true);
    expect(isNoticeLive(rolled('a', 2400), 6400)).toBe(false);
  });

  it('is not live before the reveal', () => {
    expect(isNoticeLive(rolled('a', 2400), 2399)).toBe(false);
  });
});
