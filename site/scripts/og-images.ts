import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import sharp from 'sharp';

// The share images of the guide hubs (1200×630): the map of public/og.png, its headline covered by
// the dark gradient and replaced by the hub's, in the brand fonts. Chromium draws the text because
// the fonts live only in the browser. Outside the build and CI on purpose: run when a hub headline
// or the brand changes, then commit public/og-*.png.
// Run: `pnpm --filter @lorkarium/site og:images`

const SITE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BRAND_ROOT = join(SITE_ROOT, '..', 'packages', 'brand');
const PUBLIC_DIR = join(SITE_ROOT, 'public');
const SIZE = { width: 1200, height: 630 };

interface ShareImage {
  file: string;
  /** Lines in ember, then lines in parchment, like the landing headline. */
  ember: readonly string[];
  parchment: readonly string[];
  tagline: string;
}

const IMAGES: readonly ShareImage[] = [
  {
    file: 'og-recursos.png',
    ember: ['Recursos'],
    parchment: ['da sua mesa'],
    tagline: 'Grid, iniciativa, dados 3D, visão e fichas',
  },
];

function brandColor(tokenName: string): string {
  const tokens = readFileSync(join(BRAND_ROOT, 'tokens.css'), 'utf8');
  const match = new RegExp(`--${tokenName}:\\s*(#[0-9a-f]{6})`, 'i').exec(tokens);
  if (!match?.[1]) throw new Error(`og-images: --${tokenName} not found as #rrggbb in tokens.css`);
  return match[1];
}

function fontDataUrl(file: string): string {
  const require = createRequire(join(BRAND_ROOT, 'package.json'));
  return `data:font/woff2;base64,${readFileSync(require.resolve(file)).toString('base64')}`;
}

function fontFaces(): string {
  const cinzel = fontDataUrl('@fontsource-variable/cinzel/files/cinzel-latin-wght-normal.woff2');
  const hanken = fontDataUrl(
    '@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2',
  );
  return `@font-face { font-family: Cinzel; src: url(${cinzel}); font-weight: 400 900; }
    @font-face { font-family: Hanken; src: url(${hanken}); font-weight: 100 900; }`;
}

function imageHtml(image: ShareImage): string {
  const map = readFileSync(join(PUBLIC_DIR, 'og.png')).toString('base64');
  const logo = readFileSync(join(BRAND_ROOT, 'logo-mark.svg'), 'utf8');
  const lines = (texts: readonly string[], color: string): string =>
    texts.map((text) => `<span style="color:${color}">${text}</span>`).join('');
  return `<!doctype html><style>${fontFaces()}
    body { margin: 0; width: 1200px; height: 630px; position: relative; overflow: hidden;
      background: url(data:image/png;base64,${map}); font-family: Hanken; }
    .shade { position: absolute; inset: 0;
      background: linear-gradient(90deg, #0a0b0e 0%, #0a0b0e 50%, #0a0b0e00 66%); }
    .copy { position: absolute; left: 76px; top: 104px; display: flex; flex-direction: column; }
    .brand { display: flex; align-items: center; gap: 16px; color: ${brandColor('brand-gold')};
      font: 600 22px/1 Cinzel; letter-spacing: 0.32em; }
    .brand svg { width: 30px; height: 30px; }
    h1 { margin: 34px 0 0; display: flex; flex-direction: column; font: 700 76px/1 Cinzel;
      text-transform: uppercase; }
    p { margin: 40px 0 0; color: ${brandColor('brand-label')}; font-size: 24px; }
  </style><body><div class="shade"></div><div class="copy">
    <div class="brand">${logo}<span>LORKARIUM</span></div>
    <h1>${lines(image.ember, brandColor('brand-ember'))}${lines(image.parchment, brandColor('brand-parchment'))}</h1>
    <p>${image.tagline}</p></div></body>`;
}

async function renderImage(browser: Browser, image: ShareImage): Promise<void> {
  const page = await browser.newPage({ viewport: SIZE });
  await page.setContent(imageHtml(image));
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: 'png' });
  await page.close();
  writeFileSync(join(PUBLIC_DIR, image.file), await sharp(png).png({ palette: true }).toBuffer());
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  try {
    for (const image of IMAGES) await renderImage(browser, image);
  } finally {
    await browser.close();
  }
  console.log(`og-images: ${IMAGES.map((image) => image.file).join(', ')} in ${PUBLIC_DIR}`);
}

await main();
