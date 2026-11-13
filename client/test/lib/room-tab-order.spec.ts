import { describe, expect, it } from 'vitest';
import {
  fallbackTabKey,
  neighbourTab,
  nthTab,
  restoredTabOrder,
  roomTabOrder,
  syncedTabOrder,
  type RoomTab,
} from '@/lib/room-tab-order';

const order = roomTabOrder({
  groupKey: 'group',
  order: ['doc:a', 'torre'],
  openKeys: ['torre', 'doc:a'],
});

function keys(tabs: readonly RoomTab[]): string[] {
  return tabs.map((tab) => tab.key);
}

describe('roomTabOrder', () => {
  it('lists the group, then the open tabs in the order kept, grids and items mixed', () => {
    expect(keys(order)).toEqual(['group', 'doc:a', 'torre']);
  });

  it('only the group tab cannot close', () => {
    expect(order.map((tab) => tab.closable)).toEqual([false, true, true]);
  });

  it('drops a kept key with no tab now, and puts an open key not kept yet at the end', () => {
    const tabs = roomTabOrder({
      groupKey: 'group',
      order: ['gone', 'torre'],
      openKeys: ['doc:new', 'torre'],
    });
    expect(keys(tabs)).toEqual(['group', 'torre', 'doc:new']);
  });
});

describe('syncedTabOrder', () => {
  const isGrid = (key: string): boolean => key === 'torre' || key === 'estrada';

  it('a workspace item just opened goes to the end, after a grid opened before it', () => {
    expect(syncedTabOrder(['torre'], isGrid, ['doc:a'])).toEqual(['torre', 'doc:a']);
  });

  it('a closed item leaves; the grids and the items still open keep their places', () => {
    expect(syncedTabOrder(['doc:a', 'torre', 'doc:b'], isGrid, ['doc:b'])).toEqual([
      'torre',
      'doc:b',
    ]);
  });

  it('nothing new or gone hands back the same order (no update for the store to publish)', () => {
    const kept = ['doc:a', 'torre'];
    expect(syncedTabOrder(kept, isGrid, ['doc:a'])).toBe(kept);
  });
});

describe('neighbourTab', () => {
  it('Doc A shown: next is the Torre, previous is the group', () => {
    expect(neighbourTab(order, 'doc:a', 1)?.key).toBe('torre');
    expect(neighbourTab(order, 'doc:a', -1)?.key).toBe('group');
  });

  it('wraps around both ends', () => {
    expect(neighbourTab(order, 'torre', 1)?.key).toBe('group');
    expect(neighbourTab(order, 'group', -1)?.key).toBe('torre');
  });

  it('a single tab is its own neighbour', () => {
    const alone = roomTabOrder({ groupKey: 'group', order: [], openKeys: [] });
    expect(neighbourTab(alone, 'group', 1)?.key).toBe('group');
  });

  it('nothing shown (or a home shown) counts from the group', () => {
    expect(neighbourTab(order, null, 1)?.key).toBe('doc:a');
    expect(neighbourTab(order, 'map:principal', -1)?.key).toBe('torre');
  });
});

describe('nthTab', () => {
  it('counts from 1', () => {
    expect(nthTab(order, 1)?.key).toBe('group');
    expect(nthTab(order, 3)?.key).toBe('torre');
  });

  it('past the last tab (or below 1) is nothing', () => {
    expect(nthTab(order, 9)).toBeNull();
    expect(nthTab(order, 0)).toBeNull();
  });
});

describe('restoredTabOrder', () => {
  it('puts the remembered keys back in their places, the ones still on their way too', () => {
    const back = restoredTabOrder(['doc:a', 'torre', 'doc:b'], ['torre'], new Set(['doc:a']));
    expect(back).toEqual(['doc:a', 'torre']);
  });

  it('a tab opened that the record did not know goes after the remembered ones', () => {
    expect(restoredTabOrder(['torre'], ['estrada', 'torre'], new Set())).toEqual([
      'torre',
      'estrada',
    ]);
  });
});

describe('fallbackTabKey', () => {
  const alive = (key: string): boolean => key !== 'doc:a';

  it('the closest tab before the lost one that is still there', () => {
    expect(fallbackTabKey(['torre', 'doc:b', 'doc:a', 'estrada'], 'doc:a', alive)).toBe('doc:b');
  });

  it('with none before it, the closest after it', () => {
    expect(fallbackTabKey(['doc:a', 'estrada'], 'doc:a', alive)).toBe('estrada');
  });

  it('alone, or not in the order (a home), nothing: the group', () => {
    expect(fallbackTabKey(['doc:a'], 'doc:a', alive)).toBeNull();
    expect(fallbackTabKey(['torre'], 'map', alive)).toBeNull();
  });
});
