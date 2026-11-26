import { describe, expect, it } from 'vitest';
import {
  clampTokenDockHeight,
  DEFAULT_TOKEN_DOCK_PREFS,
  readTokenDockPrefs,
  TOKEN_DOCK_MIN_HEIGHT,
  TOKEN_TRACKER_MIN_HEIGHT,
  tokenDockPrefsKey,
  writeTokenDockPrefs,
} from '@/lib/token-dock-prefs';
import { StorageFake } from '../support/storage-fake';

const KEY = tokenDockPrefsKey('user-1', 'campaign-1');

describe('tokenDockPrefsKey', () => {
  it('names the account and the table, so each keeps its own', () => {
    expect(tokenDockPrefsKey('user-1', 'campaign-1')).toBe(
      'lorkarium.tokenDockLayout.user-1.campaign-1',
    );
    expect(tokenDockPrefsKey('user-2', 'campaign-1')).not.toBe(KEY);
    expect(tokenDockPrefsKey('user-1', 'campaign-2')).not.toBe(KEY);
  });
});

describe('clampTokenDockHeight', () => {
  it('keeps a height that fits, rounded to whole pixels', () => {
    expect(clampTokenDockHeight(250.6, 700)).toBe(251);
  });

  it('never goes below the dock minimum', () => {
    expect(clampTokenDockHeight(10, 700)).toBe(TOKEN_DOCK_MIN_HEIGHT);
  });

  it('leaves the tracker its minimum above', () => {
    expect(clampTokenDockHeight(900, 700)).toBe(700 - TOKEN_TRACKER_MIN_HEIGHT);
  });

  it('on a panel too low for both, the dock minimum wins', () => {
    expect(clampTokenDockHeight(300, 150)).toBe(TOKEN_DOCK_MIN_HEIGHT);
  });

  it('a height that is not a number falls back to the minimum', () => {
    expect(clampTokenDockHeight(Number.NaN, 700)).toBe(TOKEN_DOCK_MIN_HEIGHT);
  });
});

describe('readTokenDockPrefs / writeTokenDockPrefs', () => {
  it('nothing stored gives the default: natural height, full conditions', () => {
    expect(readTokenDockPrefs(new StorageFake(), KEY)).toEqual({
      height: null,
      conditions: 'full',
    });
  });

  it('reads back what was written', () => {
    const storage = new StorageFake();

    writeTokenDockPrefs(storage, KEY, { height: 240, conditions: 'compact' });

    expect(readTokenDockPrefs(storage, KEY)).toEqual({ height: 240, conditions: 'compact' });
  });

  it('drops each field it does not understand, keeping the valid ones', () => {
    const storage = new StorageFake();
    storage.setItem(KEY, JSON.stringify({ height: '12px', conditions: 'compact' }));
    expect(readTokenDockPrefs(storage, KEY)).toEqual({ height: null, conditions: 'compact' });

    storage.setItem(KEY, JSON.stringify({ height: 300, conditions: 'tiny' }));
    expect(readTokenDockPrefs(storage, KEY)).toEqual({ height: 300, conditions: 'full' });

    storage.setItem(KEY, JSON.stringify({ height: -4 }));
    expect(readTokenDockPrefs(storage, KEY).height).toBeNull();
  });

  it('text that is not JSON gives the default', () => {
    const storage = new StorageFake();
    storage.setItem(KEY, '{oops');

    expect(readTokenDockPrefs(storage, KEY)).toEqual(DEFAULT_TOKEN_DOCK_PREFS);
  });

  it('a storage that throws reads the default and writes nothing, without throwing', () => {
    const storage = new StorageFake(true);

    expect(readTokenDockPrefs(storage, KEY)).toEqual(DEFAULT_TOKEN_DOCK_PREFS);
    expect(() =>
      writeTokenDockPrefs(storage, KEY, { height: 200, conditions: 'full' }),
    ).not.toThrow();
  });
});
