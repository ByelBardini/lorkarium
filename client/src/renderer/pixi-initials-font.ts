import { BitmapFont, type BitmapFontInstallOptions } from 'pixi.js';

/** The family every token's initials (`BitmapText`) are drawn with: one atlas for all. */
export const INITIALS_FONT_NAME = 'lorkarium-initials';

const FAMILY = 'Hanken Grotesk Variable';
const WEIGHT = '600';
// The atlas glyph size: the initials of a 1 × 1 token are ~19 px, so the glyph is only scaled up
// on bigger tokens.
const ATLAS_FONT_SIZE = 32;
// The zoom-proof resolution (ZOOM_LIMITS.max): a 512 px page of the dynamic font becomes 2048 px,
// the texture side the board keeps text under (camera.ts).
const ATLAS_RESOLUTION = 4;
// What `initialsOf` gives in pt-BR; anything else typed in the token dialog is added on demand.
const INITIALS_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ';

/** Where the atlas is installed: PixiJS `BitmapFont`, or a fake in the specs (jsdom has no canvas
 *  to rasterize glyphs). */
export interface BitmapFontInstaller {
  install(options: BitmapFontInstallOptions): void;
}

/** The page's fonts (`document.fonts`): the atlas is rasterized once, so it waits for Hanken. */
export interface FontFaceLoader {
  load(font: string): Promise<unknown>;
}

/** The atlas of the initials, installed once per page: ~300 `Text` (one texture each, ≈40 MB on the
 *  stress board) become `BitmapText` sharing one page of glyphs.
 *
 *  Example: `await SHARED_INITIALS_FONT.ready(); new BitmapText({ text: 'OC', style: { fontFamily: INITIALS_FONT_NAME } })` */
export class PixiInitialsFont {
  private installing: Promise<void> | null = null;

  constructor(
    private readonly installer: BitmapFontInstaller,
    private readonly fonts: FontFaceLoader,
  ) {}

  /** Resolves once the atlas is installed; only the first call installs it. */
  ready(): Promise<void> {
    this.installing ??= this.install();
    return this.installing;
  }

  private async install(): Promise<void> {
    await this.fonts.load(`${WEIGHT} ${ATLAS_FONT_SIZE}px "${FAMILY}"`).catch(() => undefined);
    this.installer.install({
      name: INITIALS_FONT_NAME,
      chars: INITIALS_CHARS,
      resolution: ATLAS_RESOLUTION,
      style: {
        fontFamily: `${FAMILY}, sans-serif`,
        fontWeight: WEIGHT,
        fontSize: ATLAS_FONT_SIZE,
        fill: 0xffffff,
      },
    });
  }
}

/** The atlas of the page, shared by every board renderer (PixiJS keeps fonts in a global cache). */
export const SHARED_INITIALS_FONT = new PixiInitialsFont(
  { install: (options) => BitmapFont.install(options) },
  {
    load: (font) => document.fonts.load(font),
  },
);
