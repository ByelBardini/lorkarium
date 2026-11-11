import { describe, expect, it } from 'vitest';
import { permissionRefusalOf, permissionOf } from '@/sheet-sandbox/sheet-permissions';

describe('permissionRefusalOf', () => {
  it('character.set with character:stats declared is allowed', () =>
    expect(permissionRefusalOf('character.set', ['character:stats'])).toBeNull());

  it.each([
    'ready',
    'values.set',
    'values.patch',
    'bars.adjust',
    'bars.spend',
    'dice.roll',
  ] as const)('%s needs no declaration', (type) =>
    expect(permissionRefusalOf(type, [])).toBeNull(),
  );

  it('character.set without character:stats is PERMISSION_NOT_DECLARED, naming both', () =>
    expect(permissionRefusalOf('character.set', ['sheet:images'])).toEqual({
      code: 'PERMISSION_NOT_DECLARED',
      message: 'character.set needs permission character:stats in the manifest',
    }));

  it.each([
    ['assets.upload', 'sheet:images'],
    ['assets.read', 'sheet:images'],
    ['character.setImage', 'character:portrait'],
    ['bars.create', 'character:bars'],
  ] as const)('%s without %s is refused', (type, permission) =>
    expect(permissionRefusalOf(type, [])).toEqual({
      code: 'PERMISSION_NOT_DECLARED',
      message: `${type} needs permission ${permission} in the manifest`,
    }),
  );
});

describe('permissionOf', () => {
  it('names the permission of a new capability and none of a base one', () =>
    expect([permissionOf('character.setImage'), permissionOf('values.set')]).toEqual([
      'character:portrait',
      null,
    ]));
});
