import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listenToUserGestures, resumeAudioOnGesture } from '@/lib/audio-unlock';
import { AudioContextFake, UserGesturesFake } from '../support/dice-audio-context-fake';

/** Lets the resume promise settle, so a rejection not caught would surface. */
async function settle(): Promise<void> {
  for (let tick = 0; tick < 3; tick += 1) await Promise.resolve();
}

describe('resumeAudioOnGesture', () => {
  let context: AudioContextFake;
  let gestures: UserGesturesFake;

  beforeEach(() => {
    context = new AudioContextFake();
    gestures = new UserGesturesFake();
  });

  it('a suspended context is resumed on the next gesture', () => {
    context.state = 'suspended';
    resumeAudioOnGesture(context, gestures.listen);

    gestures.gesture();

    expect(context.resumes).toBe(1);
  });

  it('a running context is left alone on a gesture', () => {
    resumeAudioOnGesture(context, gestures.listen);

    gestures.gesture();

    expect(context.resumes).toBe(0);
  });

  it('once resumed, the following gestures do not resume again', () => {
    context.state = 'suspended';
    resumeAudioOnGesture(context, gestures.listen);

    gestures.gesture();
    context.finishResume();
    gestures.gesture();

    expect(context.resumes).toBe(1);
  });

  it('a resume the browser refuses is swallowed', async () => {
    context.state = 'closed';
    resumeAudioOnGesture(context, gestures.listen);

    gestures.gesture();
    context.refuseResume();
    await settle();

    expect(context.resumes).toBe(1);
  });

  it('after the stop it no longer listens nor resumes', () => {
    context.state = 'suspended';
    const stop = resumeAudioOnGesture(context, gestures.listen);
    expect(gestures.listening).toBe(1);

    stop();
    gestures.gesture();

    expect(gestures.listening).toBe(0);
    expect(context.resumes).toBe(0);
  });
});

describe('listenToUserGestures', () => {
  let heard: string[];
  let stop: () => void;

  beforeEach(() => {
    heard = [];
    stop = listenToUserGestures(() => heard.push('gesture'));
  });

  afterEach(() => {
    stop();
    document.body.replaceChildren();
  });

  it.each(['pointerdown', 'keydown'])('a %s on the page is a gesture', (type) => {
    document.body.dispatchEvent(new Event(type, { bubbles: true }));

    expect(heard).toEqual(['gesture']);
  });

  it('a widget that stops the event still lets the gesture be heard', () => {
    const widget = document.createElement('button');
    widget.addEventListener('pointerdown', (event) => event.stopPropagation());
    document.body.append(widget);

    widget.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(heard).toEqual(['gesture']);
  });

  it('a mouse move is not a gesture', () => {
    document.body.dispatchEvent(new Event('pointermove', { bubbles: true }));

    expect(heard).toEqual([]);
  });

  it('after the unsubscribe no gesture is heard', () => {
    stop();

    document.body.dispatchEvent(new Event('keydown', { bubbles: true }));

    expect(heard).toEqual([]);
  });
});
