import { AVATAR_MAX_BYTES } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { avatarFileProblem } from '@/lib/avatar-file';

describe('avatarFileProblem', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])(
    '%s up to 5 MB can go',
    (type) => {
      expect(avatarFileProblem({ type, size: AVATAR_MAX_BYTES })).toBeNull();
    },
  );

  it('a byte past 5 MB is too large', () => {
    expect(avatarFileProblem({ type: 'image/png', size: AVATAR_MAX_BYTES + 1 })).toBe(
      'avatar_too_large',
    );
  });

  it('an SVG (or anything not an image the server reads) is unsupported', () => {
    expect(avatarFileProblem({ type: 'image/svg+xml', size: 10 })).toBe('unsupported_image');
  });
});
