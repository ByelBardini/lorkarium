import type * as Three from 'three';
import type { DiceGl, DiceOverlayHost } from '../../src/three-dice-renderer';

/** The window under the dice overlay: the jsdom document, a clock and animation frames that
 *  only run on `step(ms)`.
 *
 *  Example: `host.step(16); expect(gl.renders).toHaveLength(1)` */
export class DiceOverlayHostFake implements DiceOverlayHost {
  readonly document = document;
  innerWidth = 1920;
  innerHeight = 1080;
  devicePixelRatio = 1;
  private nowMs = 0;
  private nextId = 1;
  private readonly frames = new Map<number, FrameRequestCallback>();
  readonly performance = { now: (): number => this.nowMs } as Performance;

  requestAnimationFrame = (callback: FrameRequestCallback): number => {
    const id = this.nextId++;
    this.frames.set(id, callback);
    return id;
  };

  cancelAnimationFrame = (id: number): void => {
    this.frames.delete(id);
  };

  /** How many frames are waiting: 0 means the loop is stopped. */
  pendingFrames(): number {
    return this.frames.size;
  }

  /** Moves the clock by `ms`, then runs the frames requested before. */
  step(ms: number): void {
    this.nowMs += ms;
    const due = [...this.frames.values()];
    this.frames.clear();
    due.forEach((callback) => callback(this.nowMs));
  }
}

/** The WebGL renderer under the overlay: keeps every render's scene, the size and the dispose. */
export class DiceGlFake implements DiceGl {
  readonly renders: Three.Scene[] = [];
  size: Readonly<{ width: number; height: number }> | null = null;
  pixelRatio: number | null = null;
  disposed = false;

  setClearColor(): void {}

  setPixelRatio(ratio: number): void {
    this.pixelRatio = ratio;
  }

  setSize(width: number, height: number): void {
    this.size = { width, height };
  }

  render(scene: Three.Object3D): void {
    this.renders.push(scene as Three.Scene);
  }

  dispose(): void {
    this.disposed = true;
  }
}
