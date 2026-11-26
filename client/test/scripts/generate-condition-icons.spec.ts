import { CONDITION_ICONS } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { CONDITION_ICONS_VERSION } from '@/lib/condition-icon-version';
import {
  contractKeysOf,
  iconsVersionOf,
  readIconSets,
  sourceOf,
  whiteSvgOf,
  type IconSets,
} from '../../scripts/generate-condition-icons';

const SETS: IconSets = {
  'game-icons': {
    width: 512,
    height: 512,
    icons: { manacles: { body: '<path fill="currentColor" d="M1 1h10"/>' } },
  },
  lucide: {
    width: 24,
    height: 24,
    icons: {
      skull: {
        body: '<path fill="none" stroke="currentColor" stroke-width="2" d="M1 1h2"/>',
      },
    },
  },
  tabler: {
    width: 24,
    height: 24,
    icons: { flame: { body: '<g stroke="currentColor" stroke-width="2"><path d="M1 1"/></g>' } },
  },
  ph: { width: 256, height: 256, icons: { drop: { body: '<path fill="currentColor" d="M2"/>' } } },
  mdi: { width: 24, height: 24, icons: {} },
};

describe('whiteSvgOf', () => {
  it('a Game-icons path becomes a white filled SVG on its 512 viewBox', () => {
    const svg = whiteSvgOf(SETS, 'game-icons:manacles');
    expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 512 512"/);
    expect(svg).toContain('fill="#fff"');
    expect(svg).not.toContain('currentColor');
  });

  it.each(['skull', 'tabler:flame'])(
    'the stroke of %s turns white at 2.5, the width of before',
    (key) => {
      const svg = whiteSvgOf(SETS, key);
      expect(svg).toContain('stroke="#fff"');
      expect(svg).toContain('stroke-width="2.5"');
      expect(svg).not.toContain('stroke-width="2"');
    },
  );

  it('an icon missing from its package is an error naming the key and the library', () => {
    expect(() => whiteSvgOf(SETS, 'mdi:paw')).toThrow(/mdi:paw.*mdi/);
  });
});

describe('iconsVersionOf', () => {
  const keys = ['skull', 'game-icons:manacles'];

  it('the same bodies give the same version', () => {
    expect(iconsVersionOf(SETS, keys)).toBe(iconsVersionOf(structuredClone(SETS), keys));
  });

  it('a changed body changes the version', () => {
    const changed = structuredClone(SETS);
    changed['game-icons'].icons.manacles = { body: '<path fill="currentColor" d="M2 2h10"/>' };
    expect(iconsVersionOf(changed, keys)).not.toBe(iconsVersionOf(SETS, keys));
  });
});

describe('contractKeysOf', () => {
  it('lists every Game-icon and the curated others, without the unprefixed 28 again', () => {
    const keys = contractKeysOf(SETS, ['skull', 'lucide:skull', 'ph:drop', 'game-icons:manacles']);
    expect(keys).toEqual(['game-icons:manacles', 'ph:drop']);
  });
});

describe('the installed icon packages', () => {
  const sets = readIconSets();

  it('every icon the contract accepts has a source', () => {
    const missing = CONDITION_ICONS.filter((key) => sourceOf(sets, key) === undefined);
    expect(missing).toEqual([]);
  });

  it('the version written in the client is the one of the installed bodies (else `pnpm icons:keys`)', () => {
    expect(CONDITION_ICONS_VERSION).toBe(iconsVersionOf(sets, CONDITION_ICONS));
  });
});
