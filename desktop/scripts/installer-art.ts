import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import sharp from 'sharp';
import { encodeBmp24 } from './bmp-encoder.ts';

// Renders the installer's brand art (logo + "LORKARIUM" in Cinzel) into the BMPs NSIS loads.
// Chromium draws it because the user's Windows has no Cinzel: NSIS can only show it as a bitmap.
// Run: `pnpm --filter @lorkarium/desktop installer:art`, then commit desktop/src-tauri/nsis/art/.

const DESKTOP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BRAND_ROOT = join(DESKTOP_ROOT, '..', 'packages', 'brand');
const ART_DIR = join(DESKTOP_ROOT, 'src-tauri', 'nsis', 'art');
// The Windows display scales NSIS picks from (GetDpiForWindow); 175% falls back to 150%.
const HERO_SCALES = [100, 125, 150, 200];
const HERO_SIZE = { width: 288, height: 144 };

function brandColor(tokenName: string): string {
  const tokens = readFileSync(join(BRAND_ROOT, 'tokens.css'), 'utf8');
  const match = new RegExp(`--${tokenName}:\\s*(#[0-9a-f]{6})`, 'i').exec(tokens);
  if (!match?.[1])
    throw new Error(`installer-art: --${tokenName} not found as #rrggbb in tokens.css`);
  return match[1];
}

function cinzelDataUrl(): string {
  const require = createRequire(join(DESKTOP_ROOT, 'package.json'));
  const fontPath =
    require.resolve('@fontsource-variable/cinzel/files/cinzel-latin-wght-normal.woff2');
  return `data:font/woff2;base64,${readFileSync(fontPath).toString('base64')}`;
}

function heroHtml(): string {
  const logo = readFileSync(join(BRAND_ROOT, 'logo-mark.svg'), 'utf8');
  return `<!doctype html><style>
    @font-face { font-family: Cinzel; src: url(${cinzelDataUrl()}) format('woff2'); font-weight: 400 900; }
    html, body { margin: 0; width: 100%; height: 100%; background: ${brandColor('brand-background')}; }
    body { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
      color: ${brandColor('brand-gold')}; font: 600 28px/1 Cinzel; letter-spacing: 0.16em; }
    /* letter-spacing also trails the last letter; the same indent on the left keeps the word centered */
    span { padding-left: 0.16em; }
    svg { width: 72px; height: 72px; }
  </style><body>${logo}<span>LORKARIUM</span></body>`;
}

async function renderHero(browser: Browser, scale: number): Promise<Buffer> {
  const page = await browser.newPage({ viewport: HERO_SIZE, deviceScaleFactor: scale / 100 });
  await page.setContent(heroHtml());
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: 'png' });
  await page.close();
  return png;
}

async function writeBmp(png: Buffer, fileName: string): Promise<void> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  writeFileSync(
    join(ART_DIR, fileName),
    encodeBmp24({ width: info.width, height: info.height, rgb: data }),
  );
}

async function main(): Promise<void> {
  mkdirSync(ART_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const scale of HERO_SCALES)
      await writeBmp(await renderHero(browser, scale), `hero-${scale}.bmp`);
  } finally {
    await browser.close();
  }
  console.log(`installer-art: ${HERO_SCALES.length} hero BMPs in ${ART_DIR}`);
}

await main();
