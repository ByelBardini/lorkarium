import { describe, expect, it } from 'vitest';
import { DICE_ROLL_SAMPLES, rollSampleOf } from '@/dice-audio/dice-roll-samples';

/** dice-rolls.wav: 9.54 s at 32 kHz. */
const SPRITE_MS = 9542;

describe('DICE_ROLL_SAMPLES', () => {
  it('every roll lies inside the sprite, in order, with silence between them', () => {
    DICE_ROLL_SAMPLES.forEach((sample, index) => {
      const previous = DICE_ROLL_SAMPLES[index - 1];
      const previousEnd = previous === undefined ? 0 : previous.startMs + previous.lengthMs;
      expect(sample.startMs).toBeGreaterThanOrEqual(previousEnd + 49);
      expect(sample.startMs + sample.lengthMs).toBeLessThanOrEqual(SPRITE_MS);
    });
  });

  it('every first hit sits early in its clip, before the roll is half over', () => {
    DICE_ROLL_SAMPLES.forEach((sample) => {
      expect(sample.hitMs).toBeGreaterThan(0);
      expect(sample.hitMs).toBeLessThan(sample.lengthMs / 2);
    });
  });
});

describe('rollSampleOf', () => {
  it('picks across every recording, the last one included', () => {
    expect(rollSampleOf(() => 0, null)).toBe(DICE_ROLL_SAMPLES[0]);
    expect(rollSampleOf(() => 0.9999, null)).toBe(DICE_ROLL_SAMPLES.at(-1));
  });

  it('never repeats the recording played just before', () => {
    const first = rollSampleOf(() => 0, null);
    expect(rollSampleOf(() => 0, first)).not.toBe(first);
    expect(rollSampleOf(() => 0, first)).toBe(DICE_ROLL_SAMPLES[1]);
  });
});
