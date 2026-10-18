import type { TokenLayerDto } from '@lorkarium/contracts';
import { isSmoothArea, effectAreaBounds } from '@lorkarium/game-core';
import { Container, Graphics, Text } from 'pixi.js';
import { drawingColorValue } from '@/lib/drawing-style';
import { cellEdgesOf, smoothOutlineOf } from '@/lib/effect-area-outline';
import { EFFECT_AREA_FILL_ALPHA } from '@/lib/effect-area-style';
import { CELL_WORLD_SIZE, zoomProofTextResolution, type Point, type Size } from './camera';
import type { EffectAreaCanvas } from './effect-area-gestures';
import type { EffectAreaView } from './effect-area-view';
import { drawMarqueeShape } from './pixi-marquee';

// Design system tokens (client/src/index.css): the canvas cannot read CSS variables.
const TEXT_COLOR = 0xeae5da;
const LABEL_BACK = 0x0c0e11;
const OUTLINE_WORLD_PX = 2;
const SELECTION_MARGIN_PX = 6;
const LABEL_FONT_PX = 13;

type AreaSprite = { root: Container; shape: Graphics; selection: Graphics; key: string };

/** The areas of effect on the canvas, at the bottom of the Tokens layer (the token layer puts
 *  `container` under its drawings and tokens): painted cells at 35% with a solid outline on the
 *  outer edges, smooth shapes as a plain outline, all masked to the scene; the selected one gets
 *  the dashed gold box and its size. `draft` is the area being created, over everything. Proven
 *  by the e2e. */
export class PixiEffectAreaLayer implements EffectAreaCanvas {
  readonly container = new Container();
  readonly draft = new Container();
  private readonly areas = new Container();
  private readonly sceneMask = new Graphics();
  private readonly draftShape = new Graphics();
  private readonly label = labelText();
  private readonly sprites = new Map<string, AreaSprite>();

  constructor() {
    this.areas.mask = this.sceneMask;
    this.container.addChild(this.sceneMask, this.areas, this.label);
    this.draft.addChild(this.draftShape);
  }

  sync(views: readonly EffectAreaView[], scene: Size): void {
    this.sceneMask.clear().rect(0, 0, scene.width, scene.height).fill(0xffffff);
    const alive = new Set(views.map(({ id }) => id));
    for (const [id, sprite] of this.sprites) {
      if (alive.has(id)) continue;
      sprite.root.destroy({ children: true });
      this.sprites.delete(id);
    }
    views.forEach((view) => this.place(view));
    this.showLabel(views.find(({ selected }) => selected) ?? null);
  }

  /** The layers that go under the tokens of each layer: the areas at the bottom of Tokens, under
   *  the drawings of that layer.
   *
   *  Example: `new PixiTokenLayer(reducedMotion, areas.under(drawings.layers), textures)` */
  under(
    drawingLayers: Readonly<Record<TokenLayerDto, Container>>,
  ): Readonly<Record<TokenLayerDto, Container>> {
    const tokens = new Container();
    tokens.addChild(this.container, drawingLayers.tokens);
    return { ...drawingLayers, tokens };
  }

  /** The dragged areas follow the pointer, by `offset` world px. */
  dragBy(effectAreaIds: readonly string[], offset: Point): void {
    for (const id of effectAreaIds) this.sprites.get(id)?.root.position.set(offset.x, offset.y);
  }

  /** Back where they are confirmed: the preview or the event shows where they go. */
  release(): void {
    for (const { root } of this.sprites.values()) root.position.set(0, 0);
  }

  /** The area under the pointer while it is created; `null` clears it. */
  showDraft(view: EffectAreaView | null): void {
    this.draftShape.clear();
    this.draft.removeChildren();
    this.draft.addChild(this.draftShape);
    if (!view) return;
    paint(this.draftShape, view);
    this.draft.addChild(placedLabel(labelText(), view));
  }

  private place(view: EffectAreaView): void {
    const known = this.sprites.get(view.id);
    const sprite = known ?? this.add(view.id);
    this.areas.addChild(sprite.root);
    const key = keyOf(view);
    if (known && known.key === key) return;
    sprite.key = key;
    sprite.shape.clear();
    paint(sprite.shape, view);
    sprite.selection.clear();
    if (view.selected) drawMarqueeShape(sprite.selection, selectionBoxOf(view), 1);
  }

  private add(id: string): AreaSprite {
    const root = new Container();
    const shape = new Graphics();
    const selection = new Graphics();
    root.addChild(shape, selection);
    const sprite = { root, shape, selection, key: '' };
    this.sprites.set(id, sprite);
    return sprite;
  }

  private showLabel(view: EffectAreaView | null): void {
    this.label.visible = view !== null;
    if (view) placedLabel(this.label, view);
  }
}

function paint(graphics: Graphics, view: EffectAreaView): void {
  const color = drawingColorValue(view.color);
  const stroke = { width: OUTLINE_WORLD_PX, color, join: 'round' as const };
  if (isSmoothArea(view.area)) {
    const points = smoothOutlineOf(view.area).flatMap(({ x, y }) => [
      x * CELL_WORLD_SIZE,
      y * CELL_WORLD_SIZE,
    ]);
    graphics.poly(points).fill({ color, alpha: EFFECT_AREA_FILL_ALPHA }).stroke(stroke);
    return;
  }
  for (const { col, row } of view.cells) {
    graphics.rect(col * CELL_WORLD_SIZE, row * CELL_WORLD_SIZE, CELL_WORLD_SIZE, CELL_WORLD_SIZE);
  }
  graphics.fill({ color, alpha: EFFECT_AREA_FILL_ALPHA });
  for (const { from, to } of cellEdgesOf(view.cells)) {
    graphics.moveTo(from.x * CELL_WORLD_SIZE, from.y * CELL_WORLD_SIZE);
    graphics.lineTo(to.x * CELL_WORLD_SIZE, to.y * CELL_WORLD_SIZE);
  }
  graphics.stroke(stroke);
}

function selectionBoxOf(view: EffectAreaView): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const bounds = effectAreaBounds(view.area);
  return {
    x: bounds.x * CELL_WORLD_SIZE - SELECTION_MARGIN_PX,
    y: bounds.y * CELL_WORLD_SIZE - SELECTION_MARGIN_PX,
    width: bounds.width * CELL_WORLD_SIZE + 2 * SELECTION_MARGIN_PX,
    height: bounds.height * CELL_WORLD_SIZE + 2 * SELECTION_MARGIN_PX,
  };
}

// The size sits above the top of the shape, centered on its origin.
function placedLabel(label: Text, view: EffectAreaView): Text {
  label.text = view.label;
  const bounds = effectAreaBounds(view.area);
  label.position.set(
    view.area.x * CELL_WORLD_SIZE,
    bounds.y * CELL_WORLD_SIZE - SELECTION_MARGIN_PX,
  );
  return label;
}

function labelText(): Text {
  const label = new Text({
    text: '',
    resolution: zoomProofTextResolution(globalThis.devicePixelRatio),
    style: {
      fill: TEXT_COLOR,
      fontSize: LABEL_FONT_PX,
      fontFamily: 'Hanken Grotesk Variable, sans-serif',
      fontWeight: '700',
      stroke: { color: LABEL_BACK, width: 3 },
    },
  });
  label.anchor.set(0.5, 1);
  return label;
}

function keyOf(view: EffectAreaView): string {
  return JSON.stringify([view.area, view.color, view.selected]);
}
