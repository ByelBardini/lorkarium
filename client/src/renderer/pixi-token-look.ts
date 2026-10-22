import { ColorMatrixFilter, Container, Graphics, Text } from 'pixi.js';
import { zoomProofTextResolution } from './camera';
import { dashedRingArcs } from './dashed-ring';
import type { TokenLookStyle } from './token-look';
import { dashesOf } from './wall-view';

// Design system tokens (client/src/index.css): a cold blue-grey, apart from the side rings.
const OUTLINE_COLOR = 0x8fa3bf;
const SLEEP_COLOR = 0xeae5da;
const OUTLINE_GAP = 2;
const OUTLINE_WIDTH = 1.5;
const DASH = 5;
const DASH_GAP = 4;
const ARC_STEPS = 6;

/** The token's footprint as the look outlines it: an ellipse, or the square of a square image. */
export type LookBox = Readonly<{
  width: number;
  height: number;
  rx: number;
  ry: number;
  square: boolean;
}>;

// One filter for every greyed token: the same matrix, nothing per token. Made on first use.
let greyFilter: ColorMatrixFilter | null = null;

function sharedGreyFilter(): ColorMatrixFilter {
  if (greyFilter) return greyFilter;
  greyFilter = new ColorMatrixFilter();
  greyFilter.desaturate();
  return greyFilter;
}

/** What a look adds to a token: its face (disc, art, initials) faded and maybe greyed, a dashed
 *  outline around it, and "z z" on its top right.
 *
 *  Example: `look.draw([disc, art.container, label], tokenLookStyle(view), box)` */
export class PixiTokenLook {
  readonly container = new Container();
  private readonly outline = new Graphics();
  private readonly sleep = new Text({
    text: 'z z',
    resolution: zoomProofTextResolution(globalThis.devicePixelRatio),
    style: {
      fontFamily: 'Hanken Grotesk Variable, sans-serif',
      fontWeight: '700',
      fontStyle: 'italic',
      fill: SLEEP_COLOR,
      stroke: { color: 0x1b1f25, width: 3 },
    },
  });

  constructor() {
    this.sleep.anchor.set(1, 0);
    this.container.addChild(this.outline, this.sleep);
  }

  draw(faces: readonly Container[], style: TokenLookStyle, box: LookBox): void {
    for (const face of faces) {
      face.alpha = style.alpha;
      face.filters = style.grey ? [sharedGreyFilter()] : [];
    }
    this.outline.clear();
    if (style.dashedOutline) drawDashedOutline(this.outline, box);
    this.sleep.visible = style.sleeping;
    this.sleep.style.fontSize = Math.round(Math.max(10, box.height * 0.22));
    this.sleep.position.set(box.width, -box.height * 0.08);
  }
}

function drawDashedOutline(outline: Graphics, box: LookBox): void {
  if (box.square) return drawDashedSquare(outline, box);
  const rx = box.rx + OUTLINE_GAP;
  const ry = box.ry + OUTLINE_GAP;
  const center = { x: box.width / 2, y: box.height / 2 };
  for (const { start, end } of dashedRingArcs((rx + ry) / 2, DASH, DASH_GAP)) {
    for (let step = 0; step <= ARC_STEPS; step += 1) {
      const angle = start + ((end - start) * step) / ARC_STEPS;
      const point = { x: center.x + Math.cos(angle) * rx, y: center.y + Math.sin(angle) * ry };
      if (step === 0) outline.moveTo(point.x, point.y);
      else outline.lineTo(point.x, point.y);
    }
  }
  outline.stroke({ width: OUTLINE_WIDTH, color: OUTLINE_COLOR });
}

function drawDashedSquare(outline: Graphics, box: LookBox): void {
  const [left, top] = [-OUTLINE_GAP, -OUTLINE_GAP];
  const [right, bottom] = [box.width + OUTLINE_GAP, box.height + OUTLINE_GAP];
  const corners = [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
  corners.forEach((from, index) => {
    const to = corners[(index + 1) % corners.length] ?? from;
    for (const dash of dashesOf({ from, to }, [DASH, DASH_GAP])) {
      outline.moveTo(dash.from.x, dash.from.y).lineTo(dash.to.x, dash.to.y);
    }
  });
  outline.stroke({ width: OUTLINE_WIDTH, color: OUTLINE_COLOR });
}
