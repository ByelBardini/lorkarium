import { describe, expect, it } from 'vitest';
import {
  avatarKeyOf,
  bannerKeyOf,
  diceTextureKeyOf,
  toProfileChanges,
  toProfileDto,
} from '../../../src/modules/profiles/profiles.mapper';
import { profileRow } from '../../support/profiles-fakes';

describe('profiles mapper', () => {
  it('a chosen color is both the effective color and the choice', () => {
    expect(toProfileDto(profileRow({ color: 'rose' }))).toMatchObject({
      color: 'rose',
      colorChoice: 'rose',
    });
  });

  it('memberSince is the account creation date in ISO', () => {
    const row = profileRow({ createdAt: new Date('2026-10-05T08:30:00Z') });

    expect(toProfileDto(row).memberSince).toBe('2026-10-05T08:30:00.000Z');
  });

  it('only the fields that came become columns to write', () => {
    expect(toProfileChanges({ bio: null })).toEqual({ bio: null });
    expect(toProfileChanges({ name: 'Aninha', color: null })).toEqual({
      name: 'Aninha',
      color: null,
    });
  });

  it('the game preferences go out as kept and only the ones that came are written', () => {
    const row = profileRow({
      gameSystems: 'Tormenta',
      playSchedule: 'sábado à noite',
      contact: null,
    });

    expect(toProfileDto(row)).toMatchObject({
      gameSystems: 'Tormenta',
      playSchedule: 'sábado à noite',
      contact: null,
    });
    expect(toProfileChanges({ contact: null, gameSystems: 'GURPS' })).toEqual({
      contact: null,
      gameSystems: 'GURPS',
    });
  });

  it('a photo lives under avatars/<id>', () => {
    expect(avatarKeyOf('abc')).toBe('avatars/abc');
  });

  it('a banner lives under banners/<id> and goes out as kept', () => {
    expect(bannerKeyOf('abc')).toBe('banners/abc');
    expect(toProfileDto(profileRow({ bannerId: 'abc' })).bannerId).toBe('abc');
  });

  it('a dice texture lives under dice-textures/<id>', () => {
    expect(diceTextureKeyOf('abc')).toBe('dice-textures/abc');
  });

  it('the dice appearance goes out as it is kept, and a cleared number color is written', () => {
    const row = profileRow({ diceTextureId: 'tex', diceNumberColor: '#ffaa00' });

    expect(toProfileDto(row)).toMatchObject({ diceTextureId: 'tex', diceNumberColor: '#ffaa00' });
    expect(toProfileChanges({ diceNumberColor: null })).toEqual({ diceNumberColor: null });
  });

  it('the stored plan goes out for the seal', () => {
    const row = profileRow({ plan: 'lenda' });

    expect(toProfileDto(row)).toMatchObject({ plan: 'lenda', admin: false });
  });

  it('a global admin goes out as admin, with its stored plan', () => {
    const row = profileRow({ role: 'admin', plan: 'free' });

    expect(toProfileDto(row)).toMatchObject({ plan: 'free', admin: true, lorkariumOwner: false });
  });

  it('the Dono do Lorkarium goes out marked, for its seal', () => {
    expect(toProfileDto(profileRow({ lorkariumOwner: true })).lorkariumOwner).toBe(true);
  });
});
