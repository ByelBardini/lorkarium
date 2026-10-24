import { describe, expect, it } from 'vitest';
import {
  withWatchedScene,
  withoutWatchedScene,
  withoutWatchedTable,
  type WatchedScenes,
} from '../../src/realtime/watched-scenes';

const VHARN = 'vharn';
const QUELM = 'quelm';

function watching(entries: Record<string, string[]>): WatchedScenes {
  return new Map(Object.entries(entries).map(([table, scenes]) => [table, new Set(scenes)]));
}

function plain(watched: WatchedScenes): Record<string, string[]> {
  return Object.fromEntries([...watched].map(([table, scenes]) => [table, [...scenes]]));
}

describe('watched scenes of a connection', () => {
  it('watching the Torre adds it under its table and leaves the map received untouched', () => {
    const before = watching({ [VHARN]: ['salao'] });

    const after = withWatchedScene(before, VHARN, 'torre');

    expect(plain(after)).toEqual({ [VHARN]: ['salao', 'torre'] });
    expect(plain(before)).toEqual({ [VHARN]: ['salao'] });
  });

  it('watching the same grid twice keeps it once', () => {
    const twice = withWatchedScene(withWatchedScene(new Map(), VHARN, 'torre'), VHARN, 'torre');
    expect(plain(twice)).toEqual({ [VHARN]: ['torre'] });
  });

  it('unwatching the last grid of a table drops the table; another table stays', () => {
    const before = watching({ [VHARN]: ['torre'], [QUELM]: ['cripta'] });
    expect(plain(withoutWatchedScene(before, VHARN, 'torre'))).toEqual({ [QUELM]: ['cripta'] });
  });

  it('unwatching a grid never watched changes nothing', () => {
    const before = watching({ [VHARN]: ['torre'] });
    expect(plain(withoutWatchedScene(before, VHARN, 'salao'))).toEqual({ [VHARN]: ['torre'] });
  });

  it('leaving a table forgets every grid of it, and only of it', () => {
    const before = watching({ [VHARN]: ['torre', 'salao'], [QUELM]: ['cripta'] });
    expect(plain(withoutWatchedTable(before, VHARN))).toEqual({ [QUELM]: ['cripta'] });
  });
});
