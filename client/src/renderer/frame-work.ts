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

  viewChanged(): void {
    this.view = true;
    this.overlays = true;
    this.grid = true;
  }

  // A pan alone only moves the world container: its lines keep their width on screen.
  cameraChanged(change: CameraChange): void {
    if (change.zoomChanged) this.overlays = true;
    if (change.zoomChanged || change.gridBandLeft) this.grid = true;
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
