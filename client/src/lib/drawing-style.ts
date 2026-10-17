import type { DrawingColorDto, StrokeWidthDto } from '@lorkarium/contracts';
import type { DrawingKind } from './drawing-geometry';

/** How the next drawing looks: its shape, stroke, fill (`null` = none) and line width. */
export type DrawingStyle = Readonly<{
  kind: DrawingKind;
  stroke: DrawingColorDto;
  fill: DrawingColorDto | null;
  strokeWidth: StrokeWidthDto;
}>;

export const DEFAULT_DRAWING_STYLE: DrawingStyle = {
  kind: 'freehand',
  stroke: 'gold',
  fill: null,
  strokeWidth: 'medium',
};

/** The palette in order, with its name and color: the five bar colors of the design system
 *  (`chart-1..4` and ash) plus ink, bone and violet. Hex because the canvas cannot read CSS. */
export const DRAWING_COLORS: ReadonlyArray<
  Readonly<{ color: DrawingColorDto; label: string; hex: string }>
> = [
  { color: 'gold', label: 'Ouro', hex: '#c5a46d' },
  { color: 'steel', label: 'Aço', hex: '#8a9bb8' },
  { color: 'ember', label: 'Brasa', hex: '#b5654f' },
  { color: 'moss', label: 'Musgo', hex: '#7f9a7a' },
  { color: 'ash', label: 'Cinza', hex: '#a9a497' },
  { color: 'ink', label: 'Tinta', hex: '#5a6270' },
  { color: 'bone', label: 'Osso', hex: '#eae5da' },
  { color: 'violet', label: 'Violeta', hex: '#9a86b8' },
];

export const DRAWING_KINDS: ReadonlyArray<Readonly<{ kind: DrawingKind; label: string }>> = [
  { kind: 'freehand', label: 'Mão livre' },
  { kind: 'rectangle', label: 'Quadrado' },
  { kind: 'ellipse', label: 'Círculo' },
  { kind: 'triangle', label: 'Triângulo' },
];

export const STROKE_WIDTHS: ReadonlyArray<
  Readonly<{ width: StrokeWidthDto; label: string; worldPx: number }>
> = [
  { width: 'thin', label: 'Fina', worldPx: 2 },
  { width: 'medium', label: 'Média', worldPx: 4 },
  { width: 'thick', label: 'Grossa', worldPx: 8 },
];

/** The color as a number for the canvas.
 *
 *  Example: `drawingColorValue('gold') // 0xc5a46d` */
export function drawingColorValue(color: DrawingColorDto): number {
  const hex = DRAWING_COLORS.find((entry) => entry.color === color)?.hex ?? '#c5a46d';
  return Number.parseInt(hex.slice(1), 16);
}

/** The line width in world px (it scales with the zoom, like the rest of the map).
 *
 *  Example: `strokeWorldPx('thick') // 8` */
export function strokeWorldPx(width: StrokeWidthDto): number {
  return STROKE_WIDTHS.find((entry) => entry.width === width)?.worldPx ?? 4;
}
