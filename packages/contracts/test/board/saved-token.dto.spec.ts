import { describe, expect, it } from 'vitest';
import {
  createSavedTokenRequestDto,
  savedTokenBodyDto,
  savedTokenFolderRequestDto,
  updateSavedTokenRequestDto,
} from '../../src/board/saved-token.dto';

const IMAGE_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';

function zombieBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Zumbi',
    initials: 'ZB',
    side: 'enemy',
    width: 1,
    height: 1,
    imageAssetId: IMAGE_ID,
    aura: { kind: 'color', radius: 1, opacity: 60, color: '#22aa44' },
    bars: [
      { label: 'PV', current: 12, max: 12, color: '#cc2222', visibility: 'everyone' },
      { label: 'Fúria', current: 1, max: 3, color: '#2222cc', visibility: 'controllers' },
    ],
    forms: [{ name: 'Podre', imageAssetId: null, width: 2, height: 2, frame: 'round' }],
    activeForm: 0,
    ...overrides,
  };
}

function formsOf(count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `Forma ${index + 1}`,
    imageAssetId: null,
    width: 1,
    height: 1,
    frame: 'square',
  }));
}

function messagesOf(result: { error?: { issues: { message: string }[] } }): string {
  return (result.error?.issues ?? []).map((issue) => issue.message).join(' | ');
}

describe('savedTokenBodyDto', () => {
  it('a zombie with two bars, an aura and one form gets the defaults of a new token', () => {
    const body = savedTokenBodyDto.parse(zombieBody());

    expect(body).toMatchObject({
      name: 'Zumbi',
      layer: 'tokens',
      frame: 'square',
      facing: 0,
      sightAngle: 360,
      flipX: false,
      activeForm: 0,
    });
    expect(body.bars.map((bar) => [bar.label, bar.temp, bar.display])).toEqual([
      ['PV', 0, 'number'],
      ['Fúria', 0, 'number'],
    ]);
  });

  it('a token without forms has no active form', () => {
    const body = savedTokenBodyDto.parse(zombieBody({ forms: undefined, activeForm: undefined }));

    expect(body.forms).toEqual([]);
    expect(body.activeForm).toBeNull();
  });

  it('8 forms are accepted and the ninth is refused', () => {
    expect(savedTokenBodyDto.safeParse(zombieBody({ forms: formsOf(8) })).success).toBe(true);
    expect(savedTokenBodyDto.safeParse(zombieBody({ forms: formsOf(9) })).success).toBe(false);
  });

  it('an active form past the forms is refused citing the index and the count', () => {
    const result = savedTokenBodyDto.safeParse(zombieBody({ activeForm: 1 }));

    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('activeForm 1');
    expect(messagesOf(result)).toContain('1 form');
  });

  it.each(['col', 'row', 'hidden', 'combatantId', 'controllerIds'])(
    'a body carrying %s is refused: a saved token has no place, combat nor control',
    (key) => {
      const value = key === 'hidden' ? false : key === 'controllerIds' ? [] : 3;
      const result = savedTokenBodyDto.safeParse(zombieBody({ [key]: value }));

      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error?.issues)).toContain(key);
    },
  );
});

describe('createSavedTokenRequestDto', () => {
  it('the entry name is trimmed and the folder is optional', () => {
    const request = createSavedTokenRequestDto.parse({ name: '  Zumbi  ', token: zombieBody() });

    expect(request.name).toBe('Zumbi');
    expect(request.folderId).toBeUndefined();
  });

  it('a name of 60 characters is accepted and one of 61 is refused', () => {
    const ok = createSavedTokenRequestDto.safeParse({ name: 'z'.repeat(60), token: zombieBody() });
    const long = createSavedTokenRequestDto.safeParse({
      name: 'z'.repeat(61),
      token: zombieBody(),
    });

    expect(ok.success).toBe(true);
    expect(long.success).toBe(false);
  });

  it('a campaignId in the body is refused: the table comes from the route', () => {
    const result = createSavedTokenRequestDto.safeParse({
      name: 'Zumbi',
      token: zombieBody(),
      campaignId: IMAGE_ID,
    });

    expect(JSON.stringify(result.error?.issues)).toContain('campaignId');
  });
});

describe('updateSavedTokenRequestDto', () => {
  it('moving out of any folder alone is a change', () => {
    expect(updateSavedTokenRequestDto.parse({ folderId: null })).toEqual({ folderId: null });
  });

  it('an empty change is refused naming the keys it expects', () => {
    const result = updateSavedTokenRequestDto.safeParse({});

    expect(messagesOf(result)).toBe(
      'changes is empty; expected at least one of name, folderId, token',
    );
  });
});

describe('savedTokenFolderRequestDto', () => {
  it('a folder name of 40 characters is accepted and one of 41 is refused', () => {
    expect(savedTokenFolderRequestDto.safeParse({ name: 'p'.repeat(40) }).success).toBe(true);
    expect(savedTokenFolderRequestDto.safeParse({ name: 'p'.repeat(41) }).success).toBe(false);
  });
});
