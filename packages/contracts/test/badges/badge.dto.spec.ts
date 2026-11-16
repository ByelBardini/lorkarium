import { describe, expect, it } from 'vitest';
import {
  BADGE_NAME_MAX_LENGTH,
  adminBadgeDto,
  badgeDto,
  badgeOrderRequestDto,
  createBadgeRequestDto,
  updateBadgeRequestDto,
  userBadgesRequestDto,
} from '../../src/badges/badge.dto';

const VETERAN_ID = '7f1c2a4e-1b2c-4d3e-8f9a-0b1c2d3e4f50';
const MASTER_ID = '3a2b1c0d-9e8f-4a7b-8c6d-5e4f3a2b1c0d';
const IMAGE_ID = '9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

function messagesOf(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.message).join(' | ') ?? '';
}

describe('createBadgeRequestDto', () => {
  it('trims the name and the description of a new badge', () => {
    const parsed = createBadgeRequestDto.parse({
      name: ' Veterano ',
      description: ' Jogou 100 sessões ',
    });

    expect(parsed).toEqual({ name: 'Veterano', description: 'Jogou 100 sessões' });
  });

  it('accepts a name of exactly 40 characters', () => {
    const name = 'a'.repeat(BADGE_NAME_MAX_LENGTH);

    expect(createBadgeRequestDto.parse({ name, description: 'x' }).name).toBe(name);
  });

  it('refuses a name of 41 characters citing the length', () => {
    const result = createBadgeRequestDto.safeParse({ name: 'a'.repeat(41), description: 'x' });

    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('1 to 40');
  });

  it('refuses a description made only of spaces', () => {
    const result = createBadgeRequestDto.safeParse({ name: 'Veterano', description: '   ' });

    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('1 to 200');
  });

  it('refuses an extra key such as the position', () => {
    const result = createBadgeRequestDto.safeParse({
      name: 'Veterano',
      description: 'x',
      position: 0,
    });

    expect(result.success).toBe(false);
  });
});

describe('updateBadgeRequestDto', () => {
  it('accepts only the description', () => {
    expect(updateBadgeRequestDto.parse({ description: ' Novo ' })).toEqual({
      description: 'Novo',
    });
  });

  it('refuses an empty body', () => {
    expect(updateBadgeRequestDto.safeParse({}).success).toBe(false);
  });
});

describe('badge id lists', () => {
  it('accepts an empty list on the grant (removing every badge)', () => {
    expect(userBadgesRequestDto.parse({ badgeIds: [] })).toEqual({ badgeIds: [] });
  });

  it('accepts the catalog in another order', () => {
    const badgeIds = [MASTER_ID, VETERAN_ID];

    expect(badgeOrderRequestDto.parse({ badgeIds }).badgeIds).toEqual(badgeIds);
  });

  it('refuses a repeated id citing it', () => {
    const result = userBadgesRequestDto.safeParse({ badgeIds: [VETERAN_ID, VETERAN_ID] });

    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain(VETERAN_ID);
  });

  it('refuses a repeated id on the order too', () => {
    const result = badgeOrderRequestDto.safeParse({ badgeIds: [MASTER_ID, MASTER_ID] });

    expect(messagesOf(result)).toContain(MASTER_ID);
  });
});

describe('badge views', () => {
  const badge = { id: VETERAN_ID, name: 'Veterano', description: 'x', imageId: IMAGE_ID };

  it('refuses a public badge without an image', () => {
    expect(badgeDto.safeParse({ ...badge, imageId: null }).success).toBe(false);
  });

  it('accepts an admin badge without an image, with position and holders', () => {
    const parsed = adminBadgeDto.parse({ ...badge, imageId: null, position: 0, holders: 12 });

    expect(parsed.imageId).toBeNull();
  });
});
