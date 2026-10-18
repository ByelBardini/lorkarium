import type { Point } from '@/renderer/camera';
import type { EffectAreaCanvas } from '@/renderer/effect-area-gestures';
import type { EffectAreaView } from '@/renderer/effect-area-view';

/** The canvas of the area gestures, recording each draft shown (`null` = cleared), the last
 *  drag (ids and offset) and how many times the areas were put back.
 *
 *  Example: `expect(canvas.drafts.at(-1)?.label).toBe('Raio 3 casas · 4,5 m')` */
export class EffectAreaCanvasFake implements EffectAreaCanvas {
  readonly drafts: (EffectAreaView | null)[] = [];
  dragged: Readonly<{ effectAreaIds: readonly string[]; offset: Point }> | null = null;
  releases = 0;

  dragBy(effectAreaIds: readonly string[], offset: Point): void {
    this.dragged = { effectAreaIds: [...effectAreaIds], offset };
  }

  release(): void {
    this.releases += 1;
  }

  showDraft(view: EffectAreaView | null): void {
    this.drafts.push(view);
  }
}
