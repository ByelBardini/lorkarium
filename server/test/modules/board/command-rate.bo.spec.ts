import { describe, expect, it } from 'vitest';
import {
  COMMAND_BURST,
  COMMANDS_PER_SECOND,
  CommandRateBo,
  fullBucket,
} from '../../../src/modules/board/command-rate.bo';

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
