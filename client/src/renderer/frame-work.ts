/** What one frame redraws: the whole view, the zoom-bound overlays (walls, lights, ruler, cone,
 *  handles), the grid lines. */
export type FrameJob = Readonly<{ view: boolean; overlays: boolean; grid: boolean }>;

/** A camera change as the renderer sees it: whether the zoom moved, and whether the view left
 *  the band of grid lines already drawn. */
export type CameraChange = Readonly<{ zoomChanged: boolean; gridBandLeft: boolean }>;

/** The dirty marks of the board: every change marks, and the ticker takes one job per frame, so a
 *  burst of events, textures and wheel ticks in the same frame is drawn once.
 *
 *  Example: `work.viewChanged(); app.ticker.add(() => flush(work.take()))` */
export class FrameWork {
  private view = false;
  private overlays = false;
  private grid = false;
  // Pixi renders only when the scene graph may have moved: a full-canvas render every frame
  // saturates the main thread under software WebGL (the CI runner: e2e clicks never landed).
  private stale = true;

  viewChanged(): void {
    this.stale = true;
    this.view = true;
    this.overlays = true;
    this.grid = true;
  }

  // A pan alone only moves the world container: its lines keep their width on screen.
  cameraChanged(change: CameraChange): void {
    this.stale = true;
    if (change.zoomChanged) this.overlays = true;
    if (change.zoomChanged || change.gridBandLeft) this.grid = true;
  }

  /** Something outside the marks touched the scene graph (pointer, key, texture, glide). */
  sceneTouched(): void {
    this.stale = true;
  }

  /** The listener, marking the scene touched after each call (DOM events, textures arriving).
   *
   *  Example: `canvas.addEventListener('pointermove', work.touching(onMove))` */
  touching<E>(listener: (event: E) => void): (event: E) => void {
    return (event) => {
      listener(event);
      this.stale = true;
    };
  }

  /** Whether this frame must render the stage; true once per touch, then false until the next.
   *
   *  Example: `if (work.renderDue()) app.render()` */
  renderDue(): boolean {
    const due = this.stale;
    this.stale = false;
    return due;
  }

  pending(): boolean {
    return this.view || this.overlays || this.grid;
  }

  take(): FrameJob {
    const job = { view: this.view, overlays: this.overlays, grid: this.grid };
    this.view = false;
    this.overlays = false;
    this.grid = false;
    return job;
  }
}
