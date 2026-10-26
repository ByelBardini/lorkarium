import type {
  DiceAudioBuffer,
  DiceAudioContext,
  DiceAudioGain,
  DiceAudioNode,
  DiceAudioParam,
  DiceAudioSource,
} from '@/dice-audio/web-audio-dice-sound';

/** An audio param that records each value set, with its time. */
export class AudioParamFake implements DiceAudioParam {
  readonly sets: { value: number; atSeconds: number }[] = [];

  setValueAtTime(value: number, atSeconds: number): void {
    this.sets.push({ value, atSeconds });
  }

  /** The last value set (what the param holds). */
  get value(): number | undefined {
    return this.sets.at(-1)?.value;
  }
}

class AudioNodeFake implements DiceAudioNode {
  readonly targets: DiceAudioNode[] = [];
  disconnected = false;

  connect(destination: DiceAudioNode): void {
    this.targets.push(destination);
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

export class GainFake extends AudioNodeFake implements DiceAudioGain {
  readonly gain = new AudioParamFake();
}

export class SourceFake extends AudioNodeFake implements DiceAudioSource {
  buffer: DiceAudioBuffer | null = null;
  started: { atSeconds: number; offsetSeconds: number; durationSeconds: number } | null = null;

  start(atSeconds: number, offsetSeconds: number, durationSeconds: number): void {
    this.started = { atSeconds, offsetSeconds, durationSeconds };
  }
}

/** The decoded sprite the fake hands back, so a spec can see each source got it. */
export const DECODED_ROLLS: DiceAudioBuffer = Object.freeze({ decoded: 'dice-rolls.wav' });

/** An `AudioContext` without sound for jsdom: keeps every node made and the bytes decoded, a clock
 *  the test sets and a state it chooses (`suspended` resumes when `finishResume()` is called).
 *
 *  Example: `const context = new AudioContextFake(); createWebAudioDiceSound({ createContext: () => context, … })` */
export class AudioContextFake implements DiceAudioContext {
  currentTime = 0;
  state: AudioContextState = 'running';
  closed = false;
  readonly destination = new AudioNodeFake();
  readonly decoded: ArrayBuffer[] = [];
  readonly gains: GainFake[] = [];
  readonly sources: SourceFake[] = [];
  resumes = 0;
  private resumed: (() => void) | null = null;

  resume(): Promise<void> {
    this.resumes += 1;
    return new Promise((resolve) => (this.resumed = resolve));
  }

  /** Lets a pending `resume` finish, the context now running. */
  finishResume(): void {
    this.state = 'running';
    this.resumed?.();
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }

  decodeAudioData(bytes: ArrayBuffer): Promise<DiceAudioBuffer> {
    this.decoded.push(bytes);
    return Promise.resolve(DECODED_ROLLS);
  }

  createGain(): GainFake {
    const gain = new GainFake();
    this.gains.push(gain);
    return gain;
  }

  createBufferSource(): SourceFake {
    const source = new SourceFake();
    this.sources.push(source);
    return source;
  }

  createDynamicsCompressor(): DiceAudioNode {
    return new AudioNodeFake();
  }
}

/** The page's user gestures (a click, a key), fired by the test.
 *
 *  Example: `const gestures = new UserGesturesFake(); createWebAudioDiceSound({ onUserGesture: gestures.listen, … })` */
export class UserGesturesFake {
  private readonly listeners = new Set<() => void>();

  readonly listen = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get listening(): number {
    return this.listeners.size;
  }

  gesture(): void {
    this.listeners.forEach((listener) => listener());
  }
}
