import type { WallKindDto, WallShapeKindDto } from '@lorkarium/contracts';
import type { DrawingStyle } from './drawing-style';

/** What the next wall is: its kind (what it blocks) and the shape it is drawn with. */
export type WallStyle = Readonly<{ kind: WallKindDto; shape: WallShapeKindDto }>;

export const DEFAULT_WALL_STYLE: WallStyle = { kind: 'wall', shape: 'line' };

/** The four kinds in the order of the panel, with their name in pt-BR. */
export const WALL_KINDS: ReadonlyArray<Readonly<{ kind: WallKindDto; label: string }>> = [
  { kind: 'wall', label: 'Parede' },
  { kind: 'grate', label: 'Grade' },
  { kind: 'curtain', label: 'Cortina' },
  { kind: 'door', label: 'Porta' },
];

/** The four shapes in the order of the panel, with their name in pt-BR. */
export const WALL_SHAPES: ReadonlyArray<Readonly<{ shape: WallShapeKindDto; label: string }>> = [
  { shape: 'line', label: 'Reta' },
  { shape: 'freehand', label: 'Mão livre' },
  { shape: 'rectangle', label: 'Quadrado' },
  { shape: 'ellipse', label: 'Círculo' },
];

/** The shape a style really draws: a door is always a line.
 *
 *  Example: `drawnShapeOf({ kind: 'door', shape: 'ellipse' }) // 'line'` */
export function drawnShapeOf(style: WallStyle): WallShapeKindDto {
  return style.kind === 'door' ? 'line' : style.shape;
}

/** The name of a kind as the person reads it.
 *
 *  Example: `wallKindLabel('grate') // 'Grade'` */
export function wallKindLabel(kind: WallKindDto): string {
  return WALL_KINDS.find((entry) => entry.kind === kind)?.label ?? kind;
}

/** How the sketch of the walls tool shows under the pointer: a thin gold drawing, straight (only
 *  the first and last points) for a line.
 *
 *  Example: `wallSketchPreviewOf({ kind: 'wall', shape: 'line' }).straight // true` */
export function wallSketchPreviewOf(
  style: WallStyle,
): Readonly<{ drawing: DrawingStyle; straight: boolean }> {
  const shape = drawnShapeOf(style);
  const kind = shape === 'line' || shape === 'freehand' ? 'freehand' : shape;
  const drawing: DrawingStyle = { kind, stroke: 'gold', fill: null, strokeWidth: 'medium' };
  return { drawing, straight: shape === 'line' };
}
