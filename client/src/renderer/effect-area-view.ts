import type {
  DrawingColorDto,
  EffectAreaDto,
  EffectAreaShapeDto,
  SceneDto,
  TokenLayerDto,
} from '@lorkarium/contracts';
import {
  effectAreaCells,
  effectAreaContains,
  isSmoothArea,
  type EffectArea,
  type GridCell,
} from '@lorkarium/game-core';
import { effectAreaLabel } from '@/lib/effect-area-label';
import { shapeOfEffectArea } from '@/lib/effect-area-shape';
import { CELL_WORLD_SIZE, type Point } from './camera';

/** An area of effect as the canvas shows it: its shape (the preview when this viewer is moving
 *  or stretching it), the cells it paints, and whether a click or a marquee may take it. */
export type EffectAreaView = Readonly<{
  id: string;
  area: EffectArea;
  color: DrawingColorDto;
  cells: readonly GridCell[];
  pickable: boolean;
  selected: boolean;
  /** The size as the ruler reads it: "Cone 3 casas · 4,5 m". */
  label: string;
}>;

export type EffectAreaViewInput = Readonly<{
  effectAreas: readonly EffectAreaDto[];
  viewer: Readonly<{ userId: string; isMaster: boolean }>;
  activeLayer: TokenLayerDto;
  selectedEffectAreaIds: readonly string[];
  /** The shape this viewer asked for (or is dragging), by id, until the server answers. */
  effectAreaPreview: Readonly<Record<string, EffectAreaShapeDto>>;
  readOnly: boolean;
  scene: SceneDto;
}>;

/** Confirmed areas + local selection and previews → what the canvas draws, in creation order.
 *  `pickable`: the Tokens layer is active, the viewer is the master or the author (an area with
 *  no author left is the master's), and not while reconnecting.
 *
 *  Example: `effectAreaViewsOf({ effectAreas, viewer, activeLayer, selectedEffectAreaIds, effectAreaPreview, readOnly, scene })` */
export function effectAreaViewsOf(input: EffectAreaViewInput): EffectAreaView[] {
  const sceneCells = { widthCells: input.scene.widthCells, heightCells: input.scene.heightCells };
  return input.effectAreas.map((dto) => {
    const area: EffectArea = input.effectAreaPreview[dto.id] ?? shapeOfEffectArea(dto);
    return {
      id: dto.id,
      area,
      color: dto.color,
      cells: effectAreaCells(sceneCells, area),
      pickable: mayPick(dto, input),
      selected: input.selectedEffectAreaIds.includes(dto.id),
      label: effectAreaLabel(area, input.scene),
    };
  });
}

/** The pickable area on top under a world point (the last created): a grid shape by the cells
 *  it paints, a smooth one by its outline.
 *
 *  Example: `topEffectAreaAt(view.effectAreas, worldOf(event))?.id` */
export function topEffectAreaAt(
  views: readonly EffectAreaView[],
  world: Point,
): EffectAreaView | null {
  const point = { x: world.x / CELL_WORLD_SIZE, y: world.y / CELL_WORLD_SIZE };
  const topFirst = [...views].reverse();
  return topFirst.find((view) => view.pickable && covers(view, point)) ?? null;
}

function covers(view: EffectAreaView, point: Point): boolean {
  if (isSmoothArea(view.area)) return effectAreaContains(view.area, point);
  const col = Math.floor(point.x);
  const row = Math.floor(point.y);
  return view.cells.some((cell) => cell.col === col && cell.row === row);
}

function mayPick(area: EffectAreaDto, input: EffectAreaViewInput): boolean {
  if (input.readOnly || input.activeLayer !== 'tokens') return false;
  return input.viewer.isMaster || area.authorId === input.viewer.userId;
}
