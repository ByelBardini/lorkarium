import { zoomSettleOf } from './zoom-settle';

/** What one frame redraws: the whole view, the zoom-bound overlays (walls, lights, ruler, cone,
 *  blocker line, handles), the grid lines, and whether the zoom settled (the token strips follow
 *  it and the grid band is worked out again around the view). */
export type FrameJob = Readonly<{ view: boolean; overlays: boolean; grid: boolean; zoom: boolean }>;

/** A camera change as the renderer sees it: the zoom now, whether the view left the band of grid
 *  lines already drawn, and when (`performance.now()`), for the settle of the zoom. */
export type CameraChange = Readonly<{ zoom: number; gridBandLeft: boolean; atMs: number }>;

/** The dirty marks of the board: every change marks, and the ticker takes one job per frame, so a
 *  burst of events, textures and wheel ticks in the same frame is drawn once. A zoom gesture only
 *  scales the world: what depends on the zoom waits for it to settle (`zoomSettleOf`).
 *
 *  Example: `work.viewChanged(); app.ticker.add(() => flush(work.take(performance.now())))` */
export class FrameWork {
  private view = false;
  private overlays = false;
  private grid = false;
  private zoom = 1;
  private drawnZoom = 1;
  private zoomedAtMs = 0;
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
    if (change.zoom !== this.zoom) this.zoomedAtMs = change.atMs;
    this.zoom = change.zoom;
    if (!change.gridBandLeft) return;
    this.overlays = true;
    this.grid = true;
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

  /** Whether `take` may have work: a zoom waiting to settle keeps it pending. */
  pending(): boolean {
    return this.view || this.overlays || this.grid || this.zoom !== this.drawnZoom;
  }

  // Whatever redraws the overlays draws them at the current zoom: the zoom settles with them.
  take(nowMs: number): FrameJob {
    const zoom = this.zoom !== this.drawnZoom && (this.overlays || this.zoomSettles(nowMs));
    if (zoom) this.settleZoom();
    const job = { view: this.view, overlays: this.overlays, grid: this.grid, zoom };
    this.view = false;
    this.overlays = false;
    this.grid = false;
    return job;
  }

  private zoomSettles(nowMs: number): boolean {
    const stillForMs = nowMs - this.zoomedAtMs;
    return zoomSettleOf({ drawnZoom: this.drawnZoom, zoom: this.zoom, stillForMs }) === 'redraw';
  }

  private settleZoom(): void {
    this.drawnZoom = this.zoom;
    this.overlays = true;
    this.grid = true;
    this.stale = true;
  }
}
