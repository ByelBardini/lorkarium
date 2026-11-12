import { describe, expect, it } from 'vitest';
import {
  readStoredChoice,
  readStoredColor,
  readStoredNumber,
  readStoredSwitch,
  writeStoredChoice,
  writeStoredSwitch,
} from '@/lib/stored-choice';
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

describe('stored number', () => {
  const ANY = (): boolean => true;
  const POSITIVE = (value: number): boolean => value > 0;

  it.each([
    ['320', 320],
    ['2.5', 2.5],
    ['-5', -5],
  ])('the decimal text %s is read back as %s', (text, expected) => {
    const storage = new StorageFake();
    storage.values.set('key', text);
    expect(readStoredNumber(storage, 'key', ANY, 7)).toBe(expected);
  });

  it.each(['abc', '', ' 12', '12px', '0x10', '1e3', 'Infinity', 'NaN'])(
    'the text "%s" is not a decimal and reads as the fallback',
    (text) => {
      const storage = new StorageFake();
      storage.values.set('key', text);
      expect(readStoredNumber(storage, 'key', ANY, 7)).toBe(7);
    },
  );

  it('a decimal the caller does not accept reads as the fallback', () => {
    const storage = new StorageFake();
    storage.values.set('key', '-5');
    expect(readStoredNumber(storage, 'key', POSITIVE, 7)).toBe(7);
  });

  it('nothing stored reads as the fallback', () => {
    expect(readStoredNumber(new StorageFake(), 'key', ANY, 7)).toBe(7);
  });

  it('a storage that throws reads as the fallback', () => {
    expect(readStoredNumber(new StorageFake(true), 'key', ANY, 7)).toBe(7);
  });
});

describe('stored switch', () => {
  it('a switch written off reads back off, and on again after writing on', () => {
    const storage = new StorageFake();
    writeStoredSwitch(storage, 'key', false);
    expect(storage.values.get('key')).toBe('off');
    expect(readStoredSwitch(storage, 'key')).toBe(false);
    writeStoredSwitch(storage, 'key', true);
    expect(readStoredSwitch(storage, 'key')).toBe(true);
  });

  it.each([null, 'yes', 'OFF'])('stored %s reads as on', (stored) => {
    const storage = new StorageFake();
    if (stored !== null) storage.values.set('key', stored);
    expect(readStoredSwitch(storage, 'key')).toBe(true);
  });
});
