import { describe, expect, it } from 'vitest';
import { orphanKeysOf } from '../../../src/modules/assets/orphan-objects.bo';

const NOW = new Date('2026-11-19T12:00:00Z');
const OLD = new Date('2026-11-01T12:00:00Z');

function stored(key: string, lastModified = OLD): { key: string; lastModified: Date } {
  return { key, lastModified };
}

describe('orphanKeysOf', () => {
  it('a bucket key with neither a row nor a queued deletion is an orphan', () => {
    const orphans = orphanKeysOf({
      stored: [stored('assets/a'), stored('assets/b'), stored('assets/c')],
      rowKeys: new Set(['assets/a']),
      queuedKeys: new Set(['assets/b']),
      now: NOW,
    });

    expect(orphans).toEqual(['assets/c']);
  });

  it.each(['avatars/x', 'banners/x', 'dice-textures/x', 'badges/x', 'assetsx/y'])(
    'a key outside the assets/ prefix (%s) is never an orphan',
    (key) => {
      const orphans = orphanKeysOf({
        stored: [stored(key)],
        rowKeys: new Set(),
        queuedKeys: new Set(),
        now: NOW,
      });

      expect(orphans).toEqual([]);
    },
  );

  it('an object stored less than 24 h ago is not an orphan: its upload may still be committing', () => {
    const orphans = orphanKeysOf({
      stored: [
        stored('assets/fresh', new Date('2026-11-18T12:00:01Z')),
        stored('assets/day-old', new Date('2026-11-18T12:00:00Z')),
      ],
      rowKeys: new Set(),
      queuedKeys: new Set(),
      now: NOW,
    });

    expect(orphans).toEqual(['assets/day-old']);
  });
});
