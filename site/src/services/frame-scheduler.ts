/** Port that runs a callback before the next paint. */
export interface FrameScheduler {
  request(callback: () => void): void;
}

type RequestFrame = (callback: FrameRequestCallback) => number;

/** `FrameScheduler` over `requestAnimationFrame`. */
export class AnimationFrameScheduler implements FrameScheduler {
  constructor(
    private readonly requestFrame: RequestFrame = (callback) => requestAnimationFrame(callback),
  ) {}

  /**
   * Runs the callback once, on the next animation frame.
   * Example: `new AnimationFrameScheduler().request(paintLayers)`
   */
  request(callback: () => void): void {
    this.requestFrame(() => callback());
  }
}
