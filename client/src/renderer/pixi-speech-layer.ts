import { Container, Graphics, Text, type TextStyleOptions } from 'pixi.js';
import { zoomProofTextResolution, type Camera, type Point } from './camera';
import {
  shownSpeechOf,
  speechAnchorOf,
  speechExpired,
  type ShownSpeech,
  type SpeechBalloon,
} from './speech-balloon';
import type { TokenView } from './token-view';

// Design system tokens (client/src/index.css): `foreground` surface, `primary-foreground` ink.
const BUBBLE_COLOR = 0xeae5da;
const INK_COLOR = 0x15130f;
const RADIUS = 4;
const PAD_X = 12;
const PAD_Y = 8;
const LINE_GAP = 2;
const TAIL = 6;
const TEXT_WIDTH_MAX = 216;

/** Makes the bubble of one line, with (0, 0) at the tip of its tail (bottom center). */
export type SpeechBubbleMaker = (speakerName: string, text: string) => Container;

/** What placing the balloons needs each frame: the camera. */
export type SpeechFrame = Readonly<{ camera: Camera }>;

/** The speech balloons over the tokens, on the stage in screen px (same size at any zoom).
 *  `showSpeech` and `syncTokens` only keep their input; `animate` (the ticker) builds, places
 *  and takes out bubbles, and with no balloon alive touches nothing.
 *
 *  Example: `speech.showSpeech(sceneId, balloons); speech.animate({ camera })` */
export class PixiSpeechLayer {
  readonly container = new Container();
  private sceneId = '';
  private balloons: readonly SpeechBalloon[] = [];
  private tokenViews: readonly TokenView[] = [];
  private tokensById: ReadonlyMap<string, TokenView> | null = null;
  private readonly bubbles = new Map<string, Container>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly bubbleOf: SpeechBubbleMaker = speechBubbleOf,
  ) {}

  /** Replaces the lines handed over (the room passes all recent ones; old ones fall out alone). */
  showSpeech(sceneId: string, balloons: readonly SpeechBalloon[]): void {
    this.sceneId = sceneId;
    this.balloons = balloons;
  }

  /** The tokens of the view this viewer sees (the vision filter already took out the hidden). */
  syncTokens(tokens: readonly TokenView[]): void {
    if (tokens === this.tokenViews) return;
    this.tokenViews = tokens;
    this.tokensById = null;
  }

  /** Brings the bubbles up to date; whether a render is due (`false`: nothing changed). */
  animate(frame: SpeechFrame): boolean {
    if (this.balloons.length === 0 && this.bubbles.size === 0) return false;
    const nowMs = this.now();
    this.forgetExpired(nowMs);
    const shown = shownSpeechOf({
      sceneId: this.sceneId,
      balloons: this.balloons,
      tokens: this.tokenMap(),
      nowMs,
    });
    const removed = this.removeGone(shown);
    const added = this.addNew(shown);
    const moved = this.place(shown, frame.camera);
    return removed || added || moved;
  }

  shownCount(): number {
    return this.bubbles.size;
  }

  // Dropped once over: a list of only old lines costs nothing on the next frames.
  private forgetExpired(nowMs: number): void {
    if (!this.balloons.some((balloon) => speechExpired(balloon, nowMs))) return;
    this.balloons = this.balloons.filter((balloon) => !speechExpired(balloon, nowMs));
  }

  private tokenMap(): ReadonlyMap<string, TokenView> {
    this.tokensById ??= new Map(this.tokenViews.map((token) => [token.id, token]));
    return this.tokensById;
  }

  private removeGone(shown: readonly ShownSpeech[]): boolean {
    const kept = new Set(shown.map(({ id }) => id));
    const gone = [...this.bubbles.keys()].filter((id) => !kept.has(id));
    for (const id of gone) {
      this.bubbles.get(id)?.destroy({ children: true });
      this.bubbles.delete(id);
    }
    return gone.length > 0;
  }

  // Shown in age order, so a new bubble added last is drawn over the older ones.
  private addNew(shown: readonly ShownSpeech[]): boolean {
    const fresh = shown.filter(({ id }) => !this.bubbles.has(id));
    for (const speech of fresh) {
      const bubble = this.bubbleOf(speech.speakerName, speech.text);
      this.bubbles.set(speech.id, bubble);
      this.container.addChild(bubble);
    }
    return fresh.length > 0;
  }

  private place(shown: readonly ShownSpeech[], camera: Camera): boolean {
    let moved = false;
    for (const speech of shown) {
      const bubble = this.bubbles.get(speech.id);
      if (bubble) moved = moveTo(bubble, speechAnchorOf(speech.token, camera)) || moved;
    }
    return moved;
  }
}

// Whole px keep the text crisp; an unchanged spot asks for no render.
function moveTo(bubble: Container, anchor: Point): boolean {
  const x = Math.round(anchor.x);
  const y = Math.round(anchor.y);
  if (bubble.position.x === x && bubble.position.y === y) return false;
  bubble.position.set(x, y);
  return true;
}

/** The real bubble: the speaker's name over a semibold sans-serif line, dark ink on
 *  the light surface, 4 px corners, no shadow. Measures text, so it runs in the browser only
 *  (the spec hands the layer a fake maker). */
export function speechBubbleOf(speakerName: string, text: string): Container {
  const name = speechText(speakerName, nameStyle());
  const line = speechText(text, lineStyle());
  line.position.set(PAD_X, PAD_Y + name.height + LINE_GAP);
  name.position.set(PAD_X, PAD_Y);
  const width = Math.max(name.width, line.width) + PAD_X * 2;
  const height = PAD_Y * 2 + name.height + LINE_GAP + line.height;
  const content = new Container();
  content.addChild(bubbleShape(width, height), name, line);
  content.position.set(-width / 2, -(height + TAIL));
  const bubble = new Container();
  bubble.addChild(content);
  return bubble;
}

function speechText(content: string, style: TextStyleOptions): Text {
  const resolution = zoomProofTextResolution(globalThis.devicePixelRatio);
  return new Text({ text: content, resolution, style: { ...style, fill: INK_COLOR } });
}

function nameStyle(): TextStyleOptions {
  const fontFamily = 'Hanken Grotesk Variable, sans-serif';
  return { fontFamily, fontWeight: '700', fontSize: 11, letterSpacing: 0.4 };
}

function lineStyle(): TextStyleOptions {
  const fontFamily = 'Hanken Grotesk Variable, sans-serif';
  const wrap = { wordWrap: true, wordWrapWidth: TEXT_WIDTH_MAX, breakWords: true };
  return {
    fontFamily,
    fontStyle: 'normal',
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
    ...wrap,
  };
}

// The box and its tail pointing down at the token, in one fill.
function bubbleShape(width: number, height: number): Graphics {
  const middle = width / 2;
  return new Graphics()
    .roundRect(0, 0, width, height, RADIUS)
    .fill(BUBBLE_COLOR)
    .poly([middle - TAIL, height, middle + TAIL, height, middle, height + TAIL])
    .fill(BUBBLE_COLOR);
}
