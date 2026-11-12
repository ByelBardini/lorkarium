import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** `dist/.vite/manifest.json`: every chunk, keyed by its source (or `_name.js` when shared). */
export type BuildManifest = Readonly<
  Record<
    string,
    Readonly<{
      file: string;
      isEntry?: boolean;
      isDynamicEntry?: boolean;
      imports?: readonly string[];
      dynamicImports?: readonly string[];
    }>
  >
>;

/** `dist/.vite/ssr-manifest.json`: every module id → the files (`/assets/…`) it was bundled in. */
export type ModuleManifest = Readonly<Record<string, readonly string[]>>;

export type EntryLeak = Readonly<{ module: string; chunk: string }>;

/** The modules of `forbiddenPackage` bundled into a chunk the page downloads before running:
 *  the entry and every chunk it imports statically (an `import()` is not followed).
 *
 *  Example: `entryLeaksOf(manifest, modules, 'pixi.js') // [] while PixiJS stays behind import()` */
export function entryLeaksOf(
  manifest: BuildManifest,
  modules: ModuleManifest,
  forbiddenPackage: string,
): EntryLeak[] {
  const initial = initialChunksOf(manifest);
  const marker = `/node_modules/${forbiddenPackage}/`;
  return Object.entries(modules)
    .filter(([module]) => module.replaceAll('\\', '/').includes(marker))
    .flatMap(([module, files]) =>
      files
        .map((file) => file.replace(/^\//, ''))
        .filter((chunk) => initial.has(chunk))
        .map((chunk) => ({ module, chunk })),
    );
}

function initialChunksOf(manifest: BuildManifest): Set<string> {
  const keys = Object.keys(manifest).filter((key) => manifest[key]?.isEntry === true);
  const seen = new Set<string>();
  while (keys.length > 0) {
    const chunk = manifest[keys.pop() ?? ''];
    if (!chunk || seen.has(chunk.file)) continue;
    seen.add(chunk.file);
    keys.push(...(chunk.imports ?? []));
  }
  return seen;
}

async function jsonOf<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

// `node scripts/check-entry-chunk.ts`, right after `vite build`: login and home must not
// download the board renderer (docs/context/client/performance.md).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const vite = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', '.vite');
  const manifest = await jsonOf<BuildManifest>(path.join(vite, 'manifest.json'));
  const modules = await jsonOf<ModuleManifest>(path.join(vite, 'ssr-manifest.json'));
  const leaks = entryLeaksOf(manifest, modules, 'pixi.js');
  if (leaks.length > 0) {
    const listed = leaks.map((leak) => `  ${leak.module} → ${leak.chunk}`).join('\n');
    process.stderr.write(`pixi.js no bundle inicial (esperado só atrás de import()):\n${listed}\n`);
    process.exit(1);
  }
  process.stdout.write('bundle inicial sem pixi.js\n');
}
