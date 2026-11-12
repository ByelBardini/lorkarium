import noticeUrl from '@/chat-audio/chat-notice.wav?url';
import type { ChatSound } from '@/chat-audio/chat-sound';
import {
  listenToUserGestures,
  resumeAudioOnGesture,
  type UnlockableAudioContext,
  type UserGestureSubscription,
} from '@/lib/audio-unlock';

/** The slice of Web Audio the chat uses, so the spec runs with a fake (jsdom has no audio). */
export interface ChatAudioNode {
  connect(destination: ChatAudioNode): unknown;
  disconnect(): void;
}
export interface ChatAudioGain extends ChatAudioNode {
  readonly gain: { setValueAtTime(value: number, atSeconds: number): unknown };
}
/** Opaque to the chat: decoded once, then only handed to each source. */
export type ChatAudioBuffer = object;
export interface ChatAudioSource extends ChatAudioNode {
  buffer: ChatAudioBuffer | null;
  start(atSeconds: number): void;
}
export interface ChatAudioContext extends UnlockableAudioContext {
  readonly currentTime: number;
  readonly destination: ChatAudioNode;
  close(): Promise<void>;
  decodeAudioData(bytes: ArrayBuffer): Promise<ChatAudioBuffer>;
  createGain(): ChatAudioGain;
  createBufferSource(): ChatAudioSource;
}

/** Below the dice (their master is 0.8): a bell at full scale over a call is too much. */
export const CHAT_SOUND_GAIN = 0.5;
/** A call that waited longer than this for a suspended context is dropped: a ding long after the
 *  message points at nothing. */
export const CHAT_SOUND_STALE_MS = 1000;
/** Scheduling a hair ahead keeps the start from being clipped by the audio thread. */
const LEAD_SECONDS = 0.01;

type Voice = Readonly<{
  context: ChatAudioContext;
  notice: ChatAudioBuffer;
  output: ChatAudioNode;
}>;

function voiceOf(context: ChatAudioContext, notice: ChatAudioBuffer): Voice {
  const output = context.createGain();
  output.gain.setValueAtTime(CHAT_SOUND_GAIN, context.currentTime);
  output.connect(context.destination);
  return { context, notice, output };
}

export type WebAudioChatSoundDeps = Readonly<{
  createContext: () => ChatAudioContext;
  /** The bytes of `chat-notice.wav`. */
  fetchNotice: () => Promise<ArrayBuffer>;
  /** Milliseconds: how late the call became playable (loading, a suspended context). */
  now: () => number;
  /** Calls back on each click or key of the page; returns the unsubscribe. */
  onUserGesture: UserGestureSubscription;
}>;

class WebAudioChatSound implements ChatSound {
  private loading: Promise<Voice | null> | null = null;
  private destroyed = false;
  private stopListening: (() => void) | null = null;

  constructor(private readonly deps: WebAudioChatSoundDeps) {}

  prepare(): void {
    if (this.destroyed) return;
    this.loading ??= this.load();
  }

  play(): void {
    if (this.destroyed) return;
    const askedAt = this.deps.now();
    this.loading ??= this.load();
    void this.loading.then(async (voice) => {
      const playable = voice === null ? null : await running(voice);
      if (playable === null || this.destroyed) return;
      if (this.deps.now() - askedAt <= CHAT_SOUND_STALE_MS) ring(playable);
    });
  }

  destroy(): void {
    this.destroyed = true;
    this.stopListening?.();
    this.stopListening = null;
    void this.loading?.then((voice) => voice?.context.close().catch(() => undefined));
  }

  /** The context and the decoded sound, once; no Web Audio or a failed fetch stays silent. */
  private async load(): Promise<Voice | null> {
    try {
      const context = this.deps.createContext();
      const notice = await context.decodeAudioData(await this.deps.fetchNotice());
      if (!this.destroyed)
        this.stopListening = resumeAudioOnGesture(context, this.deps.onUserGesture);
      return voiceOf(context, notice);
    } catch {
      return null;
    }
  }
}

async function running(voice: Voice): Promise<Voice | null> {
  if (voice.context.state === 'running') return voice;
  try {
    await voice.context.resume();
    return voice;
  } catch {
    return null;
  }
}

function ring({ context, notice, output }: Voice): void {
  const source = context.createBufferSource();
  source.buffer = notice;
  source.connect(output);
  source.start(context.currentTime + LEAD_SECONDS);
}

/** The bell of a mention or a whisper (`chat-notice.wav`, 0.65 s), once per `play`. The context
 *  is created and the sound fetched on `prepare` (or the first `play`), and resumed on the
 *  user's gestures; without Web Audio it stays silent.
 *
 *  Example: `createWebAudioChatSound().play()` */
export function createWebAudioChatSound(
  deps: WebAudioChatSoundDeps = {
    createContext: () => new AudioContext(),
    fetchNotice: () => fetch(noticeUrl).then((response) => response.arrayBuffer()),
    now: () => performance.now(),
    onUserGesture: listenToUserGestures,
  },
): ChatSound {
  return new WebAudioChatSound(deps);
}
