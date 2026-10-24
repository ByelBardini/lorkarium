import type { BoardIntent } from '@/renderer/board-renderer';
import type { PressParts } from '@/renderer/primary-press';

/** Every gesture the press started, by name, in order (`sketch`, `marquee:start`, `token:drag`…). */
type GestureLog = string[];

/** A gesture that never takes a move or a release: only records that it was started. */
class IdleGestureFake {
  constructor(
    private readonly name: string,
    private readonly log: GestureLog,
  ) {}

  startSketch(): void {
    this.log.push(`${this.name}:sketch`);
  }

  press(): boolean {
    this.log.push(`${this.name}:press`);
    return true;
  }

  move(): boolean {
    return false;
  }

  release(): boolean {
    return false;
  }

  cancel(): boolean {
    return false;
  }
}

/** The marquee as `PixiMarquee` speaks it, recording each call. */
class MarqueeFake {
  private started = false;

  constructor(private readonly log: GestureLog) {}

  start(): void {
    this.started = true;
    this.log.push('marquee:start');
  }

  grow(): boolean {
    if (this.started) this.log.push('marquee:grow');
    return this.started;
  }

  end(): void {
    if (this.started) this.log.push('marquee:end');
    this.started = false;
  }
}

/** The parts a `PrimaryPress` drives, as fakes: `log` keeps the gestures, `intents` what it said.
 *
 *  Example: `const parts = new PressPartsFake(); new PrimaryPress(parts).down(context, at)` */
export class PressPartsFake implements PressParts {
  readonly log: GestureLog = [];
  readonly intents: BoardIntent[] = [];
  readonly overlays = {
    move: (): boolean => false,
    release: (): boolean => false,
    cancel: (): boolean => false,
    facingHandle: { press: (): boolean => this.logged('facing:press') },
    resizeHandles: { press: (): boolean => this.logged('resize:press') },
    marquee: new MarqueeFake(this.log),
  };
  readonly lights = new IdleGestureFake('light', this.log);
  readonly sketches = new IdleGestureFake('drawing', this.log);
  readonly areas = new IdleGestureFake('area', this.log);
  readonly tokens = {
    drag: (tokenId: string): void => void this.log.push(`token:drag:${tokenId}`),
    release: (): void => void this.log.push('token:release'),
  };
  readonly onIntent = (intent: BoardIntent): void => void this.intents.push(intent);

  kinds(): string[] {
    return this.intents.map(({ kind }) => kind);
  }

  private logged(entry: string): boolean {
    this.log.push(entry);
    return true;
  }
}
