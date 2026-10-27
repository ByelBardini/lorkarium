import rollsUrl from '@/dice-audio/dice-rolls.wav?url';
import type { DiceRollCue } from '@/dice-audio/dice-roll-cues';
import { rollSampleOf, type DiceRollSample } from '@/dice-audio/dice-roll-samples';
import type { DiceSound } from '@/dice-audio/dice-sound';

/** The slice of Web Audio the rolls use, so the spec runs with a fake (jsdom has no audio). */
export interface DiceAudioParam {
  setValueAtTime(value: number, atSeconds: number): unknown;
}
export interface DiceAudioNode {
  connect(destination: DiceAudioNode): unknown;
  disconnect(): void;
}
export interface DiceAudioGain extends DiceAudioNode {
  readonly gain: DiceAudioParam;
}
/** Opaque to the rolls: decoded once, then only handed to each source. */
export type DiceAudioBuffer = object;
export interface DiceAudioSource extends DiceAudioNode {
  buffer: DiceAudioBuffer | null;
  start(atSeconds: number, offsetSeconds: number, durationSeconds: number): void;
}
export interface DiceAudioContext {
  readonly currentTime: number;
  readonly state: AudioContextState;
  readonly destination: DiceAudioNode;
  resume(): Promise<void>;
  close(): Promise<void>;
  decodeAudioData(bytes: ArrayBuffer): Promise<DiceAudioBuffer>;
  createGain(): DiceAudioGain;
  createBufferSource(): DiceAudioSource;
  createDynamicsCompressor(): DiceAudioNode;
}

/** From this many dice a wave is a handful: a second recording joins, a hair later and softer. */
export const DICE_HANDFUL = 4;
export const DICE_HANDFUL_DELAY_SECONDS = 0.035;
export const DICE_HANDFUL_GAIN = 0.6;
/** Even a gentle throw is heard: the strength scales the rest. */
export const DICE_ROLL_MIN_GAIN = 0.35;
const MASTER_GAIN = 0.8;
/** Scheduling a hair ahead keeps the start from being clipped by the audio thread. */
const LEAD_SECONDS = 0.01;

type Voice = Readonly<{ context: DiceAudioContext; rolls: DiceAudioBuffer; output: DiceAudioNode }>;
type Bus = Readonly<{ node: DiceAudioGain; endsAt: number }>;
type Layer = Readonly<{ sample: DiceRollSample; hitAt: number; gain: number }>;

function voiceOf(context: DiceAudioContext, rolls: DiceAudioBuffer): Voice {
  const compressor = context.createDynamicsCompressor();
  compressor.connect(context.destination);
  const output = context.createGain();
  output.gain.setValueAtTime(MASTER_GAIN, context.currentTime);
  output.connect(compressor);
  return { context, rolls, output };
}

export type WebAudioDiceSoundDeps = Readonly<{
  createContext: () => DiceAudioContext;
  /** The bytes of `dice-rolls.wav`. */
  fetchRolls: () => Promise<ArrayBuffer>;
  /** Which recording plays. */
  random: () => number;
  /** Milliseconds: how late the rolls became playable (loading, a suspended context). */
  now: () => number;
  /** Calls back on each click or key of the page; returns the unsubscribe. */
  onUserGesture: (listener: () => void) => () => void;
}>;

const USER_GESTURES = ['pointerdown', 'keydown'] as const;

function listenToUserGestures(listener: () => void): () => void {
  USER_GESTURES.forEach((type) => window.addEventListener(type, listener, { capture: true }));
  return () =>
    USER_GESTURES.forEach((type) => window.removeEventListener(type, listener, { capture: true }));
}

class WebAudioDiceSound implements DiceSound {
  private loading: Promise<Voice | null> | null = null;
  private destroyed = false;
  private buses: Bus[] = [];
  private previous: DiceRollSample | null = null;
  private stopListening: (() => void) | null = null;

  constructor(private readonly deps: WebAudioDiceSoundDeps) {}

  prepare(): void {
    if (this.destroyed) return;
    this.loading ??= this.load();
  }

  play(cues: readonly DiceRollCue[]): void {
    if (this.destroyed || cues.length === 0) return;
    const askedAt = this.deps.now();
    void this.playable().then((voice) => {
      if (voice !== null) this.schedule(voice, cues, this.deps.now() - askedAt);
    });
  }

  stop(): void {
    this.buses.splice(0).forEach((bus) => bus.node.disconnect());
  }

  destroy(): void {
    this.stop();
    this.destroyed = true;
    this.stopListening?.();
    this.stopListening = null;
    void this.loading?.then((voice) => voice?.context.close().catch(() => undefined));
  }

  private playable(): Promise<Voice | null> {
    this.loading ??= this.load();
    return this.loading.then((voice) => (voice === null ? null : this.running(voice)));
  }

  /** The context and the decoded sprite, once; no Web Audio or a failed fetch stays silent. */
  private async load(): Promise<Voice | null> {
    try {
      const context = this.deps.createContext();
      const rolls = await context.decodeAudioData(await this.deps.fetchRolls());
      this.resumeOnGesture(context);
      return voiceOf(context, rolls);
    } catch {
      return null;
    }
  }

  /** A context opened before any click starts suspended (autoplay policy) and its `resume` waits
   *  for one: resuming on the gesture itself makes the next roll sound instead of being dropped
   *  late. */
  private resumeOnGesture(context: DiceAudioContext): void {
    if (this.destroyed) return;
    this.stopListening = this.deps.onUserGesture(() => {
      if (context.state !== 'running') void context.resume().catch(() => undefined);
    });
  }

  private async running(voice: Voice): Promise<Voice | null> {
    if (voice.context.state === 'running') return voice;
    try {
      await voice.context.resume();
      return voice;
    } catch {
      return null;
    }
  }

  /** `lateMs`: a roll whose dice already landed while loading or resuming is dropped, never a
   *  stale burst. */
  private schedule(voice: Voice, cues: readonly DiceRollCue[], lateMs: number): void {
    if (this.destroyed) return;
    const { context } = voice;
    this.dropFinished(context.currentTime);
    const bus = context.createGain();
    bus.connect(voice.output);
    const zero = context.currentTime + LEAD_SECONDS - lateMs / 1000;
    const layers = cues
      .filter((cue) => cue.atMs >= lateMs)
      .flatMap((cue) => this.layersOf(cue, zero + cue.atMs / 1000));
    layers.forEach((layer) => this.roll(voice, bus, layer));
    const ends = layers.map(
      (layer) => layer.hitAt + (layer.sample.lengthMs - layer.sample.hitMs) / 1000,
    );
    this.buses.push({ node: bus, endsAt: Math.max(context.currentTime, ...ends) });
  }

  private layersOf(cue: DiceRollCue, hitAt: number): Layer[] {
    const gain = DICE_ROLL_MIN_GAIN + (1 - DICE_ROLL_MIN_GAIN) * cue.strength;
    const first = this.nextSample();
    if (cue.dice < DICE_HANDFUL) return [{ sample: first, hitAt, gain }];
    const second = { sample: this.nextSample(), hitAt: hitAt + DICE_HANDFUL_DELAY_SECONDS };
    return [
      { sample: first, hitAt, gain },
      { ...second, gain: gain * DICE_HANDFUL_GAIN },
    ];
  }

  private nextSample(): DiceRollSample {
    this.previous = rollSampleOf(this.deps.random, this.previous);
    return this.previous;
  }

  /** Starts the recording `hitMs` before the landing; a landing too soon skips into the clip, so
   *  the hits still fall together. */
  private roll(voice: Voice, bus: DiceAudioNode, layer: Layer): void {
    const { context, rolls } = voice;
    const { sample } = layer;
    const wanted = layer.hitAt - sample.hitMs / 1000;
    const startAt = Math.max(wanted, context.currentTime + LEAD_SECONDS);
    const skip = startAt - wanted;
    const source = context.createBufferSource();
    source.buffer = rolls;
    const loudness = context.createGain();
    loudness.gain.setValueAtTime(layer.gain, startAt);
    source.connect(loudness);
    loudness.connect(bus);
    source.start(startAt, sample.startMs / 1000 + skip, sample.lengthMs / 1000 - skip);
  }

  private dropFinished(nowSeconds: number): void {
    this.buses.filter((bus) => bus.endsAt < nowSeconds).forEach((bus) => bus.node.disconnect());
    this.buses = this.buses.filter((bus) => bus.endsAt >= nowSeconds);
  }
}

/** The dice rolls from real recordings (`dice-rolls.wav`, cut in `DICE_ROLL_SAMPLES`): each cue
 *  plays one whole roll, its first hit on the dice landing, as loud as the throw; a handful of
 *  dice layers a second roll. The context is created and the sprite fetched on `prepare` (or the
 *  first `play`), and resumed on the user's gestures; without Web Audio it stays silent.
 *
 *  Example: `createWebAudioDiceSound().play(diceRollCuesOf(event.throw))` */
export function createWebAudioDiceSound(
  deps: WebAudioDiceSoundDeps = {
    createContext: () => new AudioContext(),
    fetchRolls: () => fetch(rollsUrl).then((response) => response.arrayBuffer()),
    random: Math.random,
    now: () => performance.now(),
    onUserGesture: listenToUserGestures,
  },
): DiceSound {
  return new WebAudioDiceSound(deps);
}
