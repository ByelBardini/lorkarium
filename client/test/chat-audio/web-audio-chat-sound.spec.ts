import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ChatSound } from '@/chat-audio/chat-sound';
import {
  CHAT_SOUND_GAIN,
  CHAT_SOUND_STALE_MS,
  createWebAudioChatSound,
} from '@/chat-audio/web-audio-chat-sound';
import {
  AudioContextFake,
  DECODED_ROLLS,
  UserGesturesFake,
} from '../support/dice-audio-context-fake';

const NOTICE_BYTES = new ArrayBuffer(8);

/** Lets the fetch, the decode and the resume promises run. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
  });
}

describe('createWebAudioChatSound', () => {
  let context: AudioContextFake;
  let contexts: number;
  let fetches: number;
  let clockMs: number;
  let gestures: UserGesturesFake;
  let sound: ChatSound;

  beforeEach(() => {
    context = new AudioContextFake();
    gestures = new UserGesturesFake();
    contexts = 0;
    fetches = 0;
    clockMs = 0;
    sound = createWebAudioChatSound({
      createContext: () => {
        contexts += 1;
        return context;
      },
      fetchNotice: () => {
        fetches += 1;
        return Promise.resolve(NOTICE_BYTES);
      },
      now: () => clockMs,
      onUserGesture: gestures.listen,
    });
  });

  it('prepare loads ahead once, so the first call is not lost to a slow fetch', async () => {
    sound.prepare();
    sound.prepare();
    await settle();
    expect([contexts, fetches]).toEqual([1, 1]);

    clockMs = 5000;
    sound.play();
    await settle();

    expect(context.sources).toHaveLength(1);
    expect(fetches).toBe(1);
  });

  it('creates no context nor fetches the sound before the first play, then decodes it once', async () => {
    expect([contexts, fetches]).toEqual([0, 0]);
    sound.play();
    sound.play();
    await settle();

    expect([contexts, fetches]).toEqual([1, 1]);
    expect(context.decoded).toEqual([NOTICE_BYTES]);
  });

  it('each play is the whole decoded sound, started a hair from now at the chat gain', async () => {
    context.currentTime = 2;
    sound.play();
    await settle();

    const [source, ...rest] = context.sources;
    expect(rest).toEqual([]);
    expect(source?.buffer).toBe(DECODED_ROLLS);
    expect(source?.started?.atSeconds).toBeCloseTo(2.01);
    const output = context.gains.find((gain) => gain === source?.targets[0]);
    expect(output?.gain.value).toBe(CHAT_SOUND_GAIN);
    expect(output?.targets).toEqual([context.destination]);
  });

  it('a context opened before any gesture resumes on the first one, then the sound plays', async () => {
    context.state = 'suspended';
    sound.prepare();
    await settle();
    expect(context.resumes).toBe(0);

    gestures.gesture();
    context.finishResume();
    gestures.gesture();
    await settle();
    sound.play();
    await settle();

    expect(context.resumes).toBe(1);
    expect(context.sources).toHaveLength(1);
  });

  it('a suspended context that resumes in time still plays the call', async () => {
    context.state = 'suspended';
    sound.play();
    await settle();
    expect(context.sources).toEqual([]);

    clockMs = CHAT_SOUND_STALE_MS;
    context.finishResume();
    await settle();

    expect(context.sources).toHaveLength(1);
  });

  it('a call that waited longer than the stale limit for the resume is dropped, never late', async () => {
    context.state = 'suspended';
    sound.play();
    await settle();

    clockMs = CHAT_SOUND_STALE_MS + 1;
    context.finishResume();
    await settle();

    expect(context.sources).toEqual([]);
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

  it('destroy closes the context and nothing plays after', async () => {
    sound.play();
    await settle();
    sound.destroy();
    sound.play();
    await settle();

    expect(context.closed).toBe(true);
    expect(context.sources).toHaveLength(1);
  });

  it('a failed fetch of the sound stays silent instead of throwing', async () => {
    const silent = createWebAudioChatSound({
      createContext: () => context,
      fetchNotice: () => Promise.reject(new Error('offline')),
      now: () => 0,
      onUserGesture: gestures.listen,
    });

    silent.play();
    await settle();

    expect(context.sources).toEqual([]);
  });

  it('a browser without Web Audio stays silent instead of throwing', async () => {
    const silent = createWebAudioChatSound({
      createContext: () => {
        throw new Error('AudioContext is not defined');
      },
      fetchNotice: () => Promise.resolve(NOTICE_BYTES),
      now: () => 0,
      onUserGesture: gestures.listen,
    });

    expect(() => silent.play()).not.toThrow();
    await settle();
    expect(gestures.listening).toBe(0);
  });
});
