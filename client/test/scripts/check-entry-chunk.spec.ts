import { describe, expect, it } from 'vitest';
import {
  entryLeaksOf,
  type BuildManifest,
  type ModuleManifest,
} from '../../scripts/check-entry-chunk';

const PIXI = '../node_modules/.pnpm/pixi.js@8.18.0/node_modules/pixi.js/lib/app/Application.mjs';
const REACT = '../node_modules/.pnpm/react@19.2.0/node_modules/react/index.js';

// The entry, a shared chunk it imports statically, and the board renderer behind an `import()`.
const MANIFEST: BuildManifest = {
  'index.html': {
    file: 'assets/index-3f2a.js',
    isEntry: true,
    imports: ['_jsx-runtime-11aa.js'],
    dynamicImports: ['src/renderer/pixi-board-renderer.ts'],
  },
  '_jsx-runtime-11aa.js': { file: 'assets/jsx-runtime-11aa.js' },
  'src/renderer/pixi-board-renderer.ts': {
    file: 'assets/pixi-board-renderer-9c8d.js',
    isDynamicEntry: true,
    imports: ['_jsx-runtime-11aa.js'],
  },
};

describe('entryLeaksOf', () => {
  it('pixi.js only in the chunk behind the import(): no leak', () => {
    const modules: ModuleManifest = {
      [PIXI]: ['/assets/pixi-board-renderer-9c8d.js'],
      [REACT]: ['/assets/jsx-runtime-11aa.js'],
    };

    expect(entryLeaksOf(MANIFEST, modules, 'pixi.js')).toEqual([]);
  });

  it('pixi.js inside the entry chunk is a leak, citing the module and the chunk', () => {
    const modules: ModuleManifest = { [PIXI]: ['/assets/index-3f2a.js'] };

    expect(entryLeaksOf(MANIFEST, modules, 'pixi.js')).toEqual([
      { module: PIXI, chunk: 'assets/index-3f2a.js' },
    ]);
  });

  it('pixi.js in a chunk the entry imports statically (even two levels down) is a leak', () => {
    const manifest: BuildManifest = {
      ...MANIFEST,
      '_jsx-runtime-11aa.js': { file: 'assets/jsx-runtime-11aa.js', imports: ['_pool-77ee.js'] },
      '_pool-77ee.js': { file: 'assets/pool-77ee.js' },
    };
    const modules: ModuleManifest = { [PIXI]: ['/assets/pool-77ee.js'] };

    expect(entryLeaksOf(manifest, modules, 'pixi.js')).toEqual([
      { module: PIXI, chunk: 'assets/pool-77ee.js' },
    ]);
  });

  it('a package whose name only ends like the forbidden one is not mistaken for it', () => {
    const lookalike = '../node_modules/not-pixi.js/index.js';
    const modules: ModuleManifest = { [lookalike]: ['/assets/index-3f2a.js'] };

    expect(entryLeaksOf(MANIFEST, modules, 'pixi.js')).toEqual([]);
  });
});
