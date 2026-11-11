import type { BitmapFontInstallOptions } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import {
  INITIALS_FONT_NAME,
  PixiInitialsFont,
  type BitmapFontInstaller,
  type FontFaceLoader,
} from '@/renderer/pixi-initials-font';

/** Counts what would be installed, without rasterizing a glyph (jsdom has no canvas). */
class BitmapFontInstallerFake implements BitmapFontInstaller {
  readonly installed: BitmapFontInstallOptions[] = [];

  install(options: BitmapFontInstallOptions): void {
    this.installed.push(options);
  }
}

/** The page's fonts: `load` resolves at once, or fails when built with `failing`. */
class FontFaceLoaderFake implements FontFaceLoader {
  readonly asked: string[] = [];

  constructor(private readonly failing = false) {}

  load(font: string): Promise<unknown> {
    this.asked.push(font);
    return this.failing ? Promise.reject(new Error('offline')) : Promise.resolve([]);
  }
}

function fontWith(fonts = new FontFaceLoaderFake()) {
  const installer = new BitmapFontInstallerFake();
  const font = new PixiInitialsFont(installer, fonts);
  return { font, installer, fonts };
}

const charsOf = (options: BitmapFontInstallOptions | undefined): string =>
  [options?.chars ?? ''].flat(2).join('');

describe('PixiInitialsFont installs one atlas for every token', () => {
  it('ready twice installs the atlas once, under the initials name', async () => {
    const { font, installer } = fontWith();

    await font.ready();
    await font.ready();

    expect(installer.installed.map(({ name }) => name)).toEqual([INITIALS_FONT_NAME]);
  });

  it('the atlas waits for Hanken Grotesk semibold, so its glyphs are not the fallback font', async () => {
    const { font, fonts } = fontWith();

    await font.ready();

    expect(fonts.asked).toEqual(['600 32px "Hanken Grotesk Variable"']);
  });

  it('a font that fails to load still installs the atlas, with the fallback', async () => {
    const { font, installer } = fontWith(new FontFaceLoaderFake(true));

    await font.ready();

    expect(installer.installed).toHaveLength(1);
  });

  it.each(['É', 'Ç', 'Ã', 'Ô', 'Z', '9'])('the pt-BR set of the atlas has %s', async (char) => {
    const { font, installer } = fontWith();

    await font.ready();

    expect(charsOf(installer.installed[0])).toContain(char);
  });

  it('the atlas is drawn at resolution 4: the zoom-proof one, and a 2048 px page', async () => {
    const { font, installer } = fontWith();

    await font.ready();

    expect(installer.installed[0]?.resolution).toBe(4);
  });

  it('the glyphs are white, so each token tints them to its color', async () => {
    const { font, installer } = fontWith();

    await font.ready();

    expect(installer.installed[0]?.style).toMatchObject({ fill: 0xffffff, fontWeight: '600' });
  });
});
