import { savedTokenBodyDto, type TokenDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { savedTokenBodyOf, spawnedTokenOf } from '@/lib/token-copy';
import { linkedLyra } from '../support/character-fixtures';
import { lyra } from '../support/table-session-fixtures';

const PORTRAIT = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const WOLF_FORM = '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
const BEAR_FORM = '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f';

function zombie(overrides: Partial<TokenDto> = {}): TokenDto {
  return lyra({
    name: 'Zumbi',
    initials: 'ZB',
    side: 'enemy',
    imageAssetId: PORTRAIT,
    aura: { kind: 'color', radius: 1, opacity: 60, color: '#22aa44' },
    forms: [
      { id: WOLF_FORM, name: 'Lobo', imageAssetId: null, width: 2, height: 2, frame: 'round' },
      { id: BEAR_FORM, name: 'Urso', imageAssetId: PORTRAIT, width: 3, height: 3, frame: 'square' },
    ],
    activeFormId: BEAR_FORM,
    ...overrides,
  });
}

function counter(): () => string {
  let next = 0;
  return () => `00000000-0000-4000-8000-${String((next += 1)).padStart(12, '0')}`;
}

describe('savedTokenBodyOf', () => {
  it('keeps the look, the aura and the bars as they are now, with display', () => {
    const body = savedTokenBodyOf(zombie());

    expect(body).toMatchObject({
      name: 'Zumbi',
      side: 'enemy',
      imageAssetId: PORTRAIT,
      aura: { kind: 'color', radius: 1 },
    });
    expect(body.bars?.map((bar) => [bar.label, bar.current, bar.max, bar.display])).toEqual([
      ['PV', 32, 45, 'number'],
      ['Inspiração', 1, 1, 'number'],
    ]);
  });

  it('the forms leave without ids and the active one as its index', () => {
    const body = savedTokenBodyOf(zombie());

    expect(body.forms?.map((form) => form.name)).toEqual(['Lobo', 'Urso']);
    expect(body.forms?.[0]).not.toHaveProperty('id');
    expect(body.activeForm).toBe(1);
  });

  it('a token without forms has no active form', () => {
    expect(savedTokenBodyOf(zombie({ forms: [], activeFormId: null })).activeForm).toBeNull();
  });

  it('carries no place, control, veil or combat: the body passes the strict contract', () => {
    const body = savedTokenBodyOf(zombie({ hidden: true }));

    expect(savedTokenBodyDto.safeParse(body).success).toBe(true);
    expect(body).not.toHaveProperty('col');
    expect(body).not.toHaveProperty('controllerIds');
  });

  it('a token linked to Lyra is saved as the free copy it shows, without the character', () => {
    const body = savedTokenBodyOf(linkedLyra());

    expect(body.name).toBe('Lyra');
    expect(body).not.toHaveProperty('characterId');
  });
});

describe('spawnedTokenOf', () => {
  it('puts the saved body on the clicked cell, without controllers', () => {
    const body = savedTokenBodyDto.parse(savedTokenBodyOf(zombie()));

    const spawned = spawnedTokenOf(body, { col: 4, row: 7 }, counter());

    expect(spawned).toMatchObject({ name: 'Zumbi', col: 4, row: 7, controllerIds: [] });
    expect(spawned).not.toHaveProperty('activeForm');
  });

  it('gives each form a new id and points the active form at the new id of its index', () => {
    const body = savedTokenBodyDto.parse(savedTokenBodyOf(zombie()));

    const spawned = spawnedTokenOf(body, { col: 0, row: 0 }, counter());

    expect(spawned.forms?.map((form) => form.id)).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ]);
    expect(spawned.activeFormId).toBe('00000000-0000-4000-8000-000000000002');
  });

  it('without an active form the spawn shows none', () => {
    const body = savedTokenBodyDto.parse(
      savedTokenBodyOf(zombie({ forms: [], activeFormId: null })),
    );

    expect(spawnedTokenOf(body, { col: 1, row: 1 }, counter()).activeFormId).toBeNull();
  });
});
