import { describe, expect, it } from 'vitest';
import {
  BOARD_RATE,
  COMMAND_BURST,
  COMMANDS_PER_SECOND,
  CommandRateBo,
  DICE_RATE,
  fullBucket,
} from '../../src/realtime/command-rate.bo';

const T0 = 1_000_000;

function burst(times: number, at = T0): ReturnType<CommandRateBo['take']> {
  let outcome = new CommandRateBo(fullBucket(at)).take(at);
  for (let index = 1; index < times; index += 1) {
    outcome = new CommandRateBo(outcome.bucket).take(at);
  }
  return outcome;
}

describe('CommandRateBo', () => {
  it('the limits are 20 commands a second with bursts of 40', () => {
    expect([COMMANDS_PER_SECOND, COMMAND_BURST]).toEqual([20, 40]);
  });

  it('40 commands at once all pass', () => {
    expect(burst(40).allowed).toBe(true);
  });

  it('the 41st of the burst is refused, with when to retry', () => {
    const outcome = burst(41);
    expect(outcome.allowed).toBe(false);
    expect(outcome.retryAfterSeconds).toBe(1);
  });

  it('a second later 20 tokens are back', () => {
    const emptied = burst(40).bucket;
    let bucket = emptied;
    for (let index = 0; index < 20; index += 1) {
      const outcome = new CommandRateBo(bucket).take(T0 + 1000);
      expect(outcome.allowed).toBe(true);
      bucket = outcome.bucket;
    }
    expect(new CommandRateBo(bucket).take(T0 + 1000).allowed).toBe(false);
  });

  it('20 a second sustained keeps passing', () => {
    let bucket = fullBucket(T0);
    for (let tick = 0; tick < 200; tick += 1) {
      const outcome = new CommandRateBo(bucket).take(T0 + tick * 50);
      expect(outcome.allowed).toBe(true);
      bucket = outcome.bucket;
    }
  });

  it('the bucket never refills above the burst', () => {
    const later = new CommandRateBo(fullBucket(T0)).take(T0 + 60_000);
    expect(later.bucket.tokens).toBe(COMMAND_BURST - 1);
  });
});

describe('CommandRateBo with the dice limits', () => {
  function diceBurst(times: number): ReturnType<CommandRateBo['take']> {
    let outcome = new CommandRateBo(fullBucket(T0, DICE_RATE), DICE_RATE).take(T0);
    for (let index = 1; index < times; index += 1) {
      outcome = new CommandRateBo(outcome.bucket, DICE_RATE).take(T0);
    }
    return outcome;
  }

  it('the dice limits are 6 at once and 2 a second', () => {
    expect(DICE_RATE).toEqual({ burst: 6, perSecond: 2 });
  });

  it('6 rolls at once pass and the 7th is refused, retrying in 1 s', () => {
    expect(diceBurst(6).allowed).toBe(true);
    expect(diceBurst(7)).toMatchObject({ allowed: false, retryAfterSeconds: 1 });
  });

  it('500 ms after the refused 7th, one more roll passes (2 a second)', () => {
    const refused = diceBurst(7);

    expect(new CommandRateBo(refused.bucket, DICE_RATE).take(T0 + 500).allowed).toBe(true);
  });

  it('499 ms after the refused 7th, it is still refused', () => {
    const refused = diceBurst(7);

    expect(new CommandRateBo(refused.bucket, DICE_RATE).take(T0 + 499).allowed).toBe(false);
  });

  it('without limits the bucket is the board one: 40 at once', () => {
    expect(BOARD_RATE).toEqual({ burst: 40, perSecond: 20 });
    expect(fullBucket(T0).tokens).toBe(40);
  });
});
