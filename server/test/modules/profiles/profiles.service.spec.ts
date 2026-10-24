import { AVATAR_MAX_BYTES } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProfilesService } from '../../../src/modules/profiles/profiles.service';
import { AssetStorageFake } from '../../support/assets-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID } from '../../support/campaigns-factories';
import {
  AvatarProcessorFake,
  ProfileChangedFake,
  ProfilesDaoFake,
  profileRow,
} from '../../support/profiles-fakes';

const NEW_AVATAR = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';
const OLD_AVATAR = 'd2e3f4a5-b6c7-4d8e-9f0a-1b2c3d4e5f60';
const PHOTO = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2]);

describe('ProfilesService', () => {
  let journal: string[];
  let profiles: ProfilesDaoFake;
  let storage: AssetStorageFake;
  let processor: AvatarProcessorFake;
  let profileChanged: ProfileChangedFake;
  let service: ProfilesService;

  beforeEach(() => {
    journal = [];
    const bia = profileRow({ id: BIA_ID, username: 'bia', name: 'Bia', color: 'moss' });
    profiles = new ProfilesDaoFake([profileRow(), bia], journal);
    storage = new AssetStorageFake(journal);
    processor = new AvatarProcessorFake(journal);
    profileChanged = new ProfileChangedFake(journal);
    service = new ProfilesService({
      profiles,
      storage,
      processor,
      profileChanged,
      newId: () => NEW_AVATAR,
    });
  });

  describe('reading and editing', () => {
    it('the profile carries the @, the drawn color with no choice, and the account date', async () => {
      expect(await service.profileOf(ANA_ID)).toEqual({
        id: ANA_ID,
        username: 'ana',
        name: 'Ana',
        color: 'teal',
        colorChoice: null,
        bio: null,
        avatarId: null,
        memberSince: '2026-10-01T12:00:00.000Z',
      });
    });

    it('changing only the color writes only the color and answers it as the choice', async () => {
      const profile = await service.update(ANA_ID, { color: 'rose' });

      expect(profiles.updates).toEqual([{ color: 'rose' }]);
      expect(profile).toMatchObject({ name: 'Ana', color: 'rose', colorChoice: 'rose' });
    });

    it('a null color goes back to the drawn one, with no choice', async () => {
      profiles.rows[0] = profileRow({ color: 'rose' });

      const profile = await service.update(ANA_ID, { color: null });

      expect(profile).toMatchObject({ color: 'teal', colorChoice: null });
    });

    it('the edit touches only the account it was asked for', async () => {
      await service.update(ANA_ID, { name: 'Aninha', bio: 'Mestre de Vharn' });

      expect(profiles.rows.find((row) => row.id === BIA_ID)).toMatchObject({ name: 'Bia' });
      expect(profiles.rows.find((row) => row.id === ANA_ID)).toMatchObject({ name: 'Aninha' });
    });

    it('the live tables are told only after the change is saved', async () => {
      await service.update(ANA_ID, { name: 'Aninha' });

      expect(journal).toEqual(['update:name', `profileChanged:${ANA_ID}`]);
    });
  });

  describe('the photo', () => {
    it('a new photo is normalized, stored under a new id, pointed at, and the old object deleted last', async () => {
      profiles.rows[0] = profileRow({ avatarId: OLD_AVATAR });

      const profile = await service.replaceAvatar(ANA_ID, PHOTO);

      expect(profile.avatarId).toBe(NEW_AVATAR);
      expect(journal).toEqual([
        'normalize',
        'put',
        `swap:${NEW_AVATAR}`,
        `profileChanged:${ANA_ID}`,
        `remove:avatars/${OLD_AVATAR}`,
      ]);
      expect(storage.objects.get(`avatars/${NEW_AVATAR}`)).toEqual({
        bytes: processor.result.bytes,
        contentType: 'image/webp',
      });
    });

    it('the first photo deletes nothing', async () => {
      await service.replaceAvatar(ANA_ID, PHOTO);

      expect(journal.filter((entry) => entry.startsWith('remove:'))).toEqual([]);
    });

    it('bytes the processor refuses are UNSUPPORTED_IMAGE with its words, and nothing is stored', async () => {
      processor.refusal = { reason: 'format', detail: 'format svg is not kept; expected png' };

      await expect(service.replaceAvatar(ANA_ID, PHOTO)).rejects.toMatchObject({
        code: 'UNSUPPORTED_IMAGE',
        message: 'format svg is not kept; expected png',
      });
      expect(journal).toEqual(['normalize']);
    });

    it('a photo above 5 MiB is AVATAR_TOO_LARGE before it is decoded', async () => {
      const huge = new Uint8Array(AVATAR_MAX_BYTES + 1);

      await expect(service.replaceAvatar(ANA_ID, huge)).rejects.toMatchObject({
        code: 'AVATAR_TOO_LARGE',
      });
      expect(journal).toEqual([]);
    });

    it('taking the photo off unpoints it, tells the tables, then deletes the object', async () => {
      profiles.rows[0] = profileRow({ avatarId: OLD_AVATAR });

      const profile = await service.removeAvatar(ANA_ID);

      expect(profile.avatarId).toBeNull();
      expect(journal).toEqual([
        'swap:none',
        `profileChanged:${ANA_ID}`,
        `remove:avatars/${OLD_AVATAR}`,
      ]);
    });

    it('taking off a photo that is not there touches neither the row nor the storage', async () => {
      const profile = await service.removeAvatar(ANA_ID);

      expect(profile.avatarId).toBeNull();
      expect(journal).toEqual([]);
      expect(profileChanged.told).toEqual([]);
    });

    it('a current photo is opened from avatars/<id>', async () => {
      profiles.rows[0] = profileRow({ avatarId: OLD_AVATAR });
      await storage.put(`avatars/${OLD_AVATAR}`, PHOTO, 'image/webp');

      const stored = await service.openAvatar(OLD_AVATAR);

      expect(stored.size).toBe(PHOTO.byteLength);
    });

    it('a replaced photo is AVATAR_NOT_FOUND even while its object still exists', async () => {
      await storage.put(`avatars/${OLD_AVATAR}`, PHOTO, 'image/webp');

      await expect(service.openAvatar(OLD_AVATAR)).rejects.toMatchObject({
        code: 'AVATAR_NOT_FOUND',
      });
    });

    it('a current photo whose object vanished from the storage is AVATAR_NOT_FOUND', async () => {
      profiles.rows[0] = profileRow({ avatarId: OLD_AVATAR });

      await expect(service.openAvatar(OLD_AVATAR)).rejects.toMatchObject({
        code: 'AVATAR_NOT_FOUND',
      });
    });
  });
});
