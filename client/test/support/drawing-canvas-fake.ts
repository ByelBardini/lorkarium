import type { SketchGeometry } from '@/lib/drawing-geometry';
import type { Point } from '@/renderer/camera';
import type { DrawingCanvas, SketchFrame } from '@/renderer/drawing-gestures';

/** The drawing canvas without PixiJS: records what it was asked to show (`offsets` of the drag
 *  under way, how many times it `released`, and each `sketches` frame, `null` = cleared).
 *
 *  Example: `new DrawingGestures(new DrawingCanvasFake(), onIntent)` */
export class DrawingCanvasFake implements DrawingCanvas {
  readonly offsets: Array<Readonly<{ ids: readonly string[]; x: number; y: number }>> = [];
  readonly sketches: Array<SketchGeometry | null> = [];
  released = 0;

  dragBy(ids: readonly string[], offset: Point): void {
    this.offsets.splice(0, this.offsets.length, { ids, x: offset.x, y: offset.y });
  }

  release(): void {
    this.released += 1;
  }

  showSketch(frame: SketchFrame | null): void {
    this.sketches.push(frame?.geometry ?? null);
  }
}
