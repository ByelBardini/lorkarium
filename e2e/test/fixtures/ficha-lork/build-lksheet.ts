// Writes e2e/test/fixtures/ficha-lork.lksheet from the template sources in ./modelo and the
// brand's woff2 fonts: `node e2e/test/fixtures/ficha-lork/build-lksheet.ts` (Node strips the
// types). Run it again after any change to ./modelo; the client spec of the fixture checks
// that the file still matches the sources.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');
const FONTS = join(ROOT, 'packages', 'brand', 'node_modules', '@fontsource-variable');
const OUTPUT = join(HERE, '..', 'ficha-lork.lksheet');

// The order is the order the CSS and the JS run in.
export const LORK_SHEET_FILES = [
  'index.html',
  'paginas/regras.html',
  'estilo/fontes.css',
  'estilo/ficha.css',
  'js/nucleo.js',
  'js/pecas.js',
  'js/barras.js',
  'js/perfil.js',
  'js/origem.js',
  'js/atributos.js',
  'js/pericias.js',
  'js/listas.js',
  'js/inventario.js',
  'js/regras.js',
  'js/texto-rico.js',
  'js/imagens.js',
  'js/eventos.js',
  'js/inicio.js',
] as const;

const FONT_ASSETS = [
  ['fontes/hanken-grotesk.woff2', 'hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2'],
  [
    'fontes/cormorant-garamond.woff2',
    'cormorant-garamond/files/cormorant-garamond-latin-wght-normal.woff2',
  ],
  [
    'fontes/cormorant-garamond-italic.woff2',
    'cormorant-garamond/files/cormorant-garamond-latin-wght-italic.woff2',
  ],
  ['fontes/cinzel.woff2', 'cinzel/files/cinzel-latin-wght-normal.woff2'],
] as const;

const MANIFEST = {
  permissions: ['character:stats', 'character:portrait', 'sheet:images'],
  bars: [
    { label: 'HP', color: 'ember', max: 12 },
    { label: 'MP', color: 'steel', max: 10 },
    { label: 'EN', color: 'moss', max: 10 },
    { label: 'ES', color: 'ash', max: 15 },
  ],
  // The ids are the table's: the import uploads each asset and writes them anew.
  assets: [],
};

async function filesOf(): Promise<{ path: string; content: string }[]> {
  return Promise.all(
    LORK_SHEET_FILES.map(async (path) => ({
      path,
      content: await readFile(join(HERE, 'modelo', path), 'utf8'),
    })),
  );
}

async function fontsOf(): Promise<{ path: string; type: string; data: string }[]> {
  return Promise.all(
    FONT_ASSETS.map(async ([path, source]) => ({
      path,
      type: 'font/woff2',
      data: (await readFile(join(FONTS, source))).toString('base64'),
    })),
  );
}

/** The `.lksheet` text of the template (format 2, the shape the client exports), with a fixed
 *  `exportedAt` so two runs over the same sources write the same bytes.
 *
 *  Example: `await writeFile(OUTPUT, await lorkSheetFileText())` */
export async function lorkSheetFileText(): Promise<string> {
  const file = {
    format: 'lorkarium.sheet-template',
    formatVersion: 2,
    exportedAt: '2026-11-10T00:00:00.000Z',
    name: 'Ficha de Lork',
    files: await filesOf(),
    manifest: MANIFEST,
    assets: await fontsOf(),
  };
  return JSON.stringify(file, null, 2) + '\n';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await writeFile(OUTPUT, await lorkSheetFileText());
  console.log(`wrote ${OUTPUT}`);
}
