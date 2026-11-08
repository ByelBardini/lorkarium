import { describe, expect, it } from 'vitest';
import { readStoredChoice, readStoredColor, writeStoredChoice } from '@/lib/stored-choice';
import { StorageFake } from '../support/storage-fake';

const CHOICES = ['open', 'closed'] as const;

describe('stored choice', () => {
  it('a stored value among the choices is read back', () => {
    const storage = new StorageFake();
    storage.values.set('key', 'closed');
    expect(readStoredChoice(storage, 'key', CHOICES, 'open')).toBe('closed');
  });

  it('nothing stored reads as the fallback', () => {
    expect(readStoredChoice(new StorageFake(), 'key', CHOICES, 'open')).toBe('open');
  });

  it('a stored value outside the choices reads as the fallback', () => {
    const storage = new StorageFake();
    storage.values.set('key', 'sideways');
    expect(readStoredChoice(storage, 'key', CHOICES, 'open')).toBe('open');
  });

  it('a storage that throws reads as the fallback and swallows the write', () => {
    const blocked = new StorageFake(true);
    expect(readStoredChoice(blocked, 'key', CHOICES, 'open')).toBe('open');
    expect(() => writeStoredChoice(blocked, 'key', 'closed')).not.toThrow();
  });

  it('a write stores the value under the key', () => {
    const storage = new StorageFake();
    writeStoredChoice(storage, 'key', 'closed');
    expect(storage.values.get('key')).toBe('closed');
  });
});

describe('stored color', () => {
  const PALETTE = ['gold', 'steel'] as const;

  it.each([
    ['a palette name', 'steel'],
    ['a custom color', '#336699'],
  ])('%s is read back', (_scenario, color) => {
    const storage = new StorageFake();
    storage.values.set('key', color);
    expect(readStoredColor(storage, 'key', PALETTE, 'gold')).toBe(color);
  });

  it.each(['red', '#FFF', '#336699;x', 'url(x)'])('%s reads as the fallback', (text) => {
    const storage = new StorageFake();
    storage.values.set('key', text);
    expect(readStoredColor(storage, 'key', PALETTE, 'gold')).toBe('gold');
  });

  it('nothing stored reads as the fallback', () => {
    expect(readStoredColor(new StorageFake(), 'key', PALETTE, 'gold')).toBe('gold');
  });

  it('a storage that throws reads as the fallback', () => {
    expect(readStoredColor(new StorageFake(true), 'key', PALETTE, 'gold')).toBe('gold');
  });
});
