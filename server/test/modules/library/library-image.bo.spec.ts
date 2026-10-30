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
    expect(canReadLibraryImage(true, null, false)).toBe(true);
    expect(canReadLibraryImage(false, 'public', false)).toBe(true);
    expect(canReadLibraryImage(false, 'private', true)).toBe(true);
    expect(canReadLibraryImage(false, 'private', false)).toBe(false);
    expect(canReadLibraryImage(false, null, false)).toBe(false);
  });
});
