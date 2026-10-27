import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DiceRollCue } from '@/dice-audio/dice-roll-cues';
import { DICE_ROLL_SAMPLES } from '@/dice-audio/dice-roll-samples';
import type { DiceSound } from '@/dice-audio/dice-sound';
import {
  createWebAudioDiceSound,
  DICE_HANDFUL,
  DICE_HANDFUL_DELAY_SECONDS,
  DICE_ROLL_MIN_GAIN,
} from '@/dice-audio/web-audio-dice-sound';
import {
  AudioContextFake,
  DECODED_ROLLS,
  type SourceFake,
  UserGesturesFake,
} from '../support/dice-audio-context-fake';

/** One d20 landing 400 ms after the event, a full-strength throw. */
const ONE_DIE: DiceRollCue = { atMs: 400, strength: 1, dice: 1 };
const SPRITE = new ArrayBuffer(8);
const [FIRST, SECOND] = DICE_ROLL_SAMPLES;

/** Lets the fetch, the decode and the resume promises run. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
  });
}

function sampleOf(source: SourceFake | undefined) {
  const offset = source?.started?.offsetSeconds ?? Number.NaN;
  return DICE_ROLL_SAMPLES.find(
    (sample) =>
      offset >= sample.startMs / 1000 - 1e-9 && offset < (sample.startMs + sample.lengthMs) / 1000,
  );
}

describe('createWebAudioDiceSound', () => {
  let context: AudioContextFake;
  let contexts: number;
  let fetches: number;
  let clockMs: number;
  let gestures: UserGesturesFake;
  let sound: DiceSound;

  beforeEach(() => {
    context = new AudioContextFake();
    gestures = new UserGesturesFake();
    contexts = 0;
    fetches = 0;
    clockMs = 0;
    sound = createWebAudioDiceSound({
      createContext: () => {
        contexts += 1;
        return context;
      },
      fetchRolls: () => {
        fetches += 1;
        return Promise.resolve(SPRITE);
      },
      random: () => 0,
      now: () => clockMs,
      onUserGesture: gestures.listen,
    });
  });

  it('prepare loads ahead, so the first roll is not lost to a slow fetch', async () => {
    sound.prepare();
    sound.prepare();
    await settle();
    expect([contexts, fetches]).toEqual([1, 1]);

    clockMs = 5000;
    sound.play([ONE_DIE]);
    await settle();

    expect(context.sources).toHaveLength(1);
    expect(fetches).toBe(1);
  });

  it('a context opened before any gesture resumes on the first one, then the rolls sound', async () => {
    context.state = 'suspended';
    sound.prepare();
    await settle();
    expect(context.resumes).toBe(0);

    gestures.gesture();
    context.finishResume();
    gestures.gesture();
    await settle();
    sound.play([ONE_DIE]);
    await settle();

    expect(context.resumes).toBe(1);
    expect(context.sources).toHaveLength(1);
  });

  it('destroy stops listening to the gestures', async () => {
    sound.prepare();
    await settle();
    expect(gestures.listening).toBe(1);

    sound.destroy();

    expect(gestures.listening).toBe(0);
  });

  it('destroyed while loading, it never starts listening to the gestures', async () => {
    sound.prepare();
    sound.destroy();
    await settle();

    expect(gestures.listening).toBe(0);
  });

  it('creates no context nor fetches the sprite before the first roll, then only once', async () => {
    expect([contexts, fetches]).toEqual([0, 0]);
    sound.play([]);
    sound.play([ONE_DIE]);
    sound.play([ONE_DIE]);
    await settle();

    expect([contexts, fetches]).toEqual([1, 1]);
    expect(context.decoded).toEqual([SPRITE]);
  });

  it('a roll is one whole recording, its first hit on the landing', async () => {
    context.currentTime = 2;
    sound.play([ONE_DIE]);
    await settle();

    const [source, ...rest] = context.sources;
    expect(rest).toEqual([]);
    expect(source?.buffer).toBe(DECODED_ROLLS);
    expect(source?.started?.offsetSeconds).toBe((FIRST?.startMs ?? 0) / 1000);
    expect(source?.started?.durationSeconds).toBe((FIRST?.lengthMs ?? 0) / 1000);
    const hitAt = (source?.started?.atSeconds ?? 0) + (FIRST?.hitMs ?? 0) / 1000;
    expect(hitAt).toBeCloseTo(2 + 0.01 + 0.4);
  });

  it('a landing sooner than the clip’s own lead skips into it, so the hits still meet', async () => {
    sound.play([{ ...ONE_DIE, atMs: 0 }]);
    await settle();

    const started = context.sources[0]?.started;
    // The landing is now + the lead: the whole lead of the clip is skipped.
    const skip = (FIRST?.hitMs ?? 0) / 1000;
    expect(started?.atSeconds).toBeCloseTo(0.01);
    expect(started?.offsetSeconds).toBeCloseTo((FIRST?.startMs ?? 0) / 1000 + skip);
    expect(started?.durationSeconds).toBeCloseTo((FIRST?.lengthMs ?? 0) / 1000 - skip);
  });

  it('two rolls in a row play two different recordings', async () => {
    sound.play([ONE_DIE]);
    sound.play([ONE_DIE]);
    await settle();

    expect(context.sources.map(sampleOf)).toEqual([FIRST, SECOND]);
  });

  it('a gentle throw is quieter, never silent', async () => {
    sound.play([{ ...ONE_DIE, strength: 0 }]);
    await settle();

    const loudness = context.gains.find((gain) => gain === context.sources[0]?.targets[0]);
    expect(loudness?.gain.value).toBe(DICE_ROLL_MIN_GAIN);
  });

  it(`a handful (${DICE_HANDFUL} dice) layers a second recording, a hair later and softer`, async () => {
    sound.play([{ ...ONE_DIE, dice: DICE_HANDFUL }]);
    await settle();

    const [one, two] = context.sources;
    const hitOf = (source: SourceFake | undefined): number =>
      (source?.started?.atSeconds ?? 0) + (sampleOf(source)?.hitMs ?? 0) / 1000;
    const gainOf = (source: SourceFake | undefined): number =>
      context.gains.find((gain) => gain === source?.targets[0])?.gain.value ?? Number.NaN;
    expect(context.sources).toHaveLength(2);
    expect(sampleOf(two)).not.toBe(sampleOf(one));
    expect(hitOf(two) - hitOf(one)).toBeCloseTo(DICE_HANDFUL_DELAY_SECONDS);
    expect(gainOf(two)).toBeLessThan(gainOf(one));
  });

  it('one roll per cue: an explosion wave is a second roll at its own landing', async () => {
    sound.play([ONE_DIE, { ...ONE_DIE, atMs: 2200 }]);
    await settle();

    expect(context.sources).toHaveLength(2);
  });

  it('a suspended context resumes and drops the rolls whose dice already landed', async () => {
    context.state = 'suspended';
    sound.play([ONE_DIE, { ...ONE_DIE, atMs: 2200 }]);
    await settle();
    expect(context.sources).toEqual([]);

    clockMs = 600;
    context.finishResume();
    await settle();

    expect(context.sources).toHaveLength(1);
  });

  it('stop disconnects what is still sounding and the sound plays again after', async () => {
    sound.play([ONE_DIE]);
    await settle();

    sound.stop();
    sound.play([ONE_DIE]);
    await settle();

    expect(context.gains.filter((gain) => gain.disconnected)).toHaveLength(1);
    expect(context.sources).toHaveLength(2);
  });

  it('destroy closes the context and nothing plays after', async () => {
    sound.play([ONE_DIE]);
    await settle();
    sound.destroy();
    sound.play([ONE_DIE]);
    await settle();

    expect(context.closed).toBe(true);
    expect(context.sources).toHaveLength(1);
  });

  it('a failed fetch of the sprite stays silent instead of throwing', async () => {
    const silent = createWebAudioDiceSound({
      createContext: () => context,
      fetchRolls: () => Promise.reject(new Error('offline')),
      random: () => 0,
      now: () => 0,
      onUserGesture: gestures.listen,
    });

    silent.play([ONE_DIE]);
    await settle();

    expect(context.sources).toEqual([]);
  });

  it('a browser without Web Audio stays silent instead of throwing', async () => {
    const silent = createWebAudioDiceSound({
      createContext: () => {
        throw new Error('AudioContext is not defined');
      },
      fetchRolls: () => Promise.resolve(SPRITE),
      random: () => 0,
      now: () => 0,
      onUserGesture: gestures.listen,
    });

    expect(() => silent.play([ONE_DIE])).not.toThrow();
    await settle();
  });
});
