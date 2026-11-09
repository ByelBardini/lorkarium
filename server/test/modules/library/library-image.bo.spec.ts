import { describe, expect, it } from 'vitest';
import {
  canReadLibraryImage,
  requireLibraryImageAsset,
} from '../../../src/modules/library/library-image.bo';
describe('library image policy', () => {
  it('only accepts reserved assets', () => {
    expect(() =>
      requireLibraryImageAsset({ id: 'a', purpose: 'library_image' }, 'a'),
    ).not.toThrow();
    expect(() => requireLibraryImageAsset({ id: 'a', purpose: 'token' }, 'a')).toThrow();
    expect(() => requireLibraryImageAsset(undefined, 'a')).toThrow();
  });
  it('allows master, public image and current presentation independently', () => {
    expect(canReadLibraryImage(true, null, false, false)).toBe(true);
    expect(canReadLibraryImage(false, 'public', false, false)).toBe(true);
    expect(canReadLibraryImage(false, 'private', true, false)).toBe(true);
    expect(canReadLibraryImage(false, 'private', false, false)).toBe(false);
    expect(canReadLibraryImage(false, null, false, false)).toBe(false);
  });
  it('a private folder hides a public image from who is not a master, unless it is presented', () => {
    expect(canReadLibraryImage(false, 'public', false, true)).toBe(false);
    expect(canReadLibraryImage(true, 'public', false, true)).toBe(true);
    expect(canReadLibraryImage(false, 'public', true, true)).toBe(true);
  });
});
