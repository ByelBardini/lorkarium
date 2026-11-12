/** The part of an `AudioContext` the unlock touches, so a spec runs it with a fake. */
export interface UnlockableAudioContext {
  readonly state: AudioContextState;
  resume(): Promise<void>;
}

/** Calls back on each click or key of the page; returns the unsubscribe. */
export type UserGestureSubscription = (listener: () => void) => () => void;

const USER_GESTURES = ['pointerdown', 'keydown'] as const;

/** Each click or key of the window, heard in the capture phase so a widget that stops the event
 *  still counts as the gesture the browser waits for.
 *
 *  Example: `const stop = listenToUserGestures(() => context.resume())` */
export function listenToUserGestures(listener: () => void): () => void {
  USER_GESTURES.forEach((type) => window.addEventListener(type, listener, { capture: true }));
  return () =>
    USER_GESTURES.forEach((type) => window.removeEventListener(type, listener, { capture: true }));
}

/** A context opened before any click starts suspended (autoplay policy of Chromium/WebView2) and
 *  its `resume` only finishes inside a gesture: resuming on each gesture while it is not running
 *  makes the next sound play instead of being dropped late. A refused resume is swallowed.
 *  Returns the stop.
 *
 *  Example: `const stopUnlock = resumeAudioOnGesture(new AudioContext())` */
export function resumeAudioOnGesture(
  context: UnlockableAudioContext,
  onUserGesture: UserGestureSubscription = listenToUserGestures,
): () => void {
  return onUserGesture(() => {
    if (context.state !== 'running') void context.resume().catch(() => undefined);
  });
}
