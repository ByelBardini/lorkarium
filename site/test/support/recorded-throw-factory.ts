import type { RecordedThrow } from '@/lib/recorded-throws';

const RESTING_FRAMES = [0, 1000, 0, 0, 0, 0, 32767];

/** A recorded d20 throw (one model per value) at rest, settling at 1500 ms. */
export function recordedThrow(values: number[] = [17]): RecordedThrow {
  return {
    throw: {
      aspect: 16 / 9,
      frameMs: 1000 / 30,
      models: values.map(() => ({
        kind: 'd20',
        startMs: 0,
        settleMs: 1500,
        frames: RESTING_FRAMES,
      })),
    },
    values,
  };
}
