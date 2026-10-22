import { Container, Graphics, Text } from 'pixi.js';
import type { TokenView } from './board-view';
import { zoomProofTextResolution } from './camera';
import { nameTagTop } from './name-tag';
import { tokenWorldRect } from './token-box';

// Design system tokens (client/src/index.css): a light plate with dark text, readable on any map.
const PLATE_COLOR = 0xeae5da;
const NAME_COLOR = 0x1b1f25;
const FONT_SIZE = 15;
const PADDING_X = 6;
const PADDING_Y = 2;

/** The name of one token on a light plate, centered under it (and under its condition strip);
 *  hidden until asked to show. */
export class PixiNameTag {
  readonly container = new Container();
  private readonly plate = new Graphics();
  private readonly label = new Text({
    text: '',
    resolution: zoomProofTextResolution(globalThis.devicePixelRatio),
    style: {
      fontFamily: 'Hanken Grotesk Variable, sans-serif',
      fontWeight: '700',
      fontSize: FONT_SIZE,
      fill: NAME_COLOR,
    },
  });

  constructor() {
    this.label.anchor.set(0.5, 0);
    this.container.addChild(this.plate, this.label);
    this.container.visible = false;
  }

  /** Example: `nameTag.draw(view, showsNameTag(view, hoveredId), strip.height)` */
  draw(view: TokenView, visible: boolean, stripHeight: number): void {
    this.container.visible = visible;
    if (!visible) return;
    const rect = tokenWorldRect(view);
    this.label.text = view.name;
    const width = this.label.width + PADDING_X * 2;
    const height = this.label.height + PADDING_Y * 2;
    const top = nameTagTop(rect.height, stripHeight);
    this.plate
      .clear()
      .rect(rect.width / 2 - width / 2, top, width, height)
      .fill(PLATE_COLOR);
    this.label.position.set(rect.width / 2, top + PADDING_Y);
  }
}
