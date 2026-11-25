import {
  Assets,
  CanvasTextMetrics,
  Container,
  Sprite,
  Text,
  TextStyle,
  Texture,
  type TextStyleOptions,
} from 'pixi.js';
import { customEmojiImageUrlOf, emoteImageUrlOf } from '@/emotes/emote-images';
import type { CustomEmojiRefDto } from '@lorkarium/contracts';
import { zoomProofTextResolution } from './camera';
import { flowSpeechItems, speechRunsOf, type SpeechRun } from './speech-flow';

/** A balloon's line, drawn, with its size (the flowed width, not the bounds of the pictures
 *  still loading). */
export type SpeechLine = Readonly<{ view: Container; width: number; height: number }>;

/** What drawing a line needs: its style and ink, the wrap width, and what to call when a picture
 *  arrives (the board renders on demand). */
export type SpeechLineStyle = Readonly<{
  style: TextStyleOptions;
  ink: number;
  maxWidth: number;
  redraw: () => void;
  /** The sender's custom emojis the line may name (`customEmojis` of the message). */
  customEmojis?: readonly CustomEmojiRefDto[];
}>;

// The text's line is 20 px: a smiley fits it, a meme makes its row a little taller.
const EMOTE_PX = { smiley: 20, meme: 26 } as const;

/** The line of a balloon: one wrapped `Text` when it has no emote, else words and pictures
 *  flowed by `flowSpeechItems`. Browser only (measures text, loads textures).
 *
 *  Example: `const line = speechLineOf('Ha :D', { style, ink: 0x15130f, maxWidth: 216, redraw })` */
export function speechLineOf(text: string, look: SpeechLineStyle): SpeechLine {
  const runs = speechRunsOf(text, look.customEmojis);
  if (runs.every((run) => run.kind === 'word')) {
    const plain = speechTextOf(text, look.style, look.ink);
    return { view: plain, width: plain.width, height: plain.height };
  }
  const views = runs.map((run) => runViewOf(run, look));
  const space = spaceWidthOf(look.style);
  const sizes = views.map((child, index) => ({
    width: child.width,
    height: child.height,
    gapAfter: runs[index]?.spaced ? space : 0,
  }));
  const layout = flowSpeechItems(sizes, look.maxWidth);
  const view = new Container();
  views.forEach((child, index) => {
    const at = layout.positions[index] ?? { x: 0, y: 0 };
    child.position.set(Math.round(at.x), Math.round(at.y));
  });
  view.addChild(...views);
  return { view, width: layout.width, height: layout.height };
}

/** A crisp `Text` of the balloon at any zoom, in the given ink.
 *
 *  Example: `speechTextOf('Goblin', nameStyle(), 0x15130f)` */
export function speechTextOf(content: string, style: TextStyleOptions, ink: number): Text {
  const resolution = zoomProofTextResolution(globalThis.devicePixelRatio);
  return new Text({ text: content, resolution, style: { ...style, fill: ink } });
}

// A lone or trailing space measures 0 in PixiJS: take it as the difference "a a" − "aa".
function spaceWidthOf(style: TextStyleOptions): number {
  const textStyle = new TextStyle(style);
  const spaced = CanvasTextMetrics.measureText('a a', textStyle).width;
  return spaced - CanvasTextMetrics.measureText('aa', textStyle).width;
}

function runViewOf(run: SpeechRun, look: SpeechLineStyle): Container {
  if (run.kind === 'word') return speechTextOf(run.text, look.style, look.ink);
  if (run.kind === 'emote') {
    return pictureSpriteOf(emoteImageUrlOf(run.emote.id), EMOTE_PX[run.emote.kind], look.redraw);
  }
  return pictureSpriteOf(customEmojiImageUrlOf(run.emojiId), EMOTE_PX.meme, look.redraw);
}

// Sized at once, so the line is laid out before the picture arrives; a picture that fails leaves
// the empty space (the chat has the code).
// The parser is named: a custom emoji's URL has no extension to pick it by.
function pictureSpriteOf(url: string, size: number, redraw: () => void): Sprite {
  const sprite = new Sprite(Texture.EMPTY);
  sprite.setSize(size);
  Assets.load<Texture>({ src: url, parser: 'texture' }).then(
    (texture) => {
      if (sprite.destroyed) return;
      sprite.texture = texture;
      sprite.setSize(size);
      redraw();
    },
    () => undefined,
  );
  return sprite;
}
