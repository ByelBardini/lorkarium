import type { ImageCropRect } from '@/services/assets-api';
import type { ProfileDto, UpdateProfileRequestDto } from '@lorkarium/contracts';
import { memberColorOf } from '@lorkarium/game-core';
import type { AccountLoadFailure, AccountResult } from '@/services/account-failure';
import type { ProfileApi, ProfileFailure } from '@/services/profile-api';
import { ANA } from './auth-api-fake';
import { ScriptedAnswers } from './scripted-answers';

/** Ana's own profile, matching `ANA` of the auth fake (automatic color, no photo, no bio, no dice
 *  texture and the automatic dice number color). */
export const ANA_PROFILE: ProfileDto = {
  id: ANA.id,
  username: ANA.username,
  name: ANA.name,
  color: ANA.color,
  colorChoice: null,
  bio: null,
  avatarId: null,
  bannerId: null,
  gameSystems: null,
  playSchedule: null,
  contact: null,
  diceTextureId: null,
  diceNumberColor: null,
  memberSince: '2026-10-01T12:00:00.000Z',
  plan: ANA.plan,
  admin: ANA.role === 'admin',
  lorkariumOwner: ANA.lorkariumOwner,
  badges: [],
};

/** The id the server gives the next photo sent. */
export const UPLOADED_AVATAR_ID = '4f3e2d1c-0b9a-4876-a543-210fedcba987';

/** The id the server gives the next banner sent. */
export const UPLOADED_BANNER_ID = '9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

/** The id the server gives the next dice texture sent. */
export const UPLOADED_DICE_TEXTURE_ID = '7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d';

type Answers = {
  get: AccountResult<ProfileDto, AccountLoadFailure>;
  update: AccountResult<ProfileDto, ProfileFailure>;
  uploadAvatar: AccountResult<ProfileDto, ProfileFailure>;
  avatarFromLink: AccountResult<ProfileDto, ProfileFailure>;
  removeAvatar: AccountResult<ProfileDto, ProfileFailure>;
  uploadDiceTexture: AccountResult<ProfileDto, ProfileFailure>;
  diceTextureFromLink: AccountResult<ProfileDto, ProfileFailure>;
  removeDiceTexture: AccountResult<ProfileDto, ProfileFailure>;
  uploadBanner: AccountResult<ProfileDto, ProfileFailure>;
  bannerFromLink: AccountResult<ProfileDto, ProfileFailure>;
  removeBanner: AccountResult<ProfileDto, ProfileFailure>;
};

/** A `ProfileApi` that keeps a profile like the server would: an update, a photo, a dice texture or a banner
 *  sent or taken away changes what the next `get` answers. Any method can be scripted (`answer`, `hold`). */
export class ProfileApiFake implements ProfileApi {
  profile: ProfileDto = ANA_PROFILE;
  readonly answers = new ScriptedAnswers<Answers>();

  get(): Promise<Answers['get']> {
    return this.answers.reply('get', undefined, () => this.current());
  }

  update(input: UpdateProfileRequestDto): Promise<Answers['update']> {
    return this.answers.reply('update', input, () =>
      this.save(updatedProfile(this.profile, input)),
    );
  }

  uploadAvatar(file: Blob): Promise<Answers['uploadAvatar']> {
    return this.answers.reply('uploadAvatar', file, () =>
      this.save({ ...this.profile, avatarId: UPLOADED_AVATAR_ID }),
    );
  }

  avatarFromLink(url: string): Promise<Answers['avatarFromLink']> {
    return this.answers.reply('avatarFromLink', url, () =>
      this.save({ ...this.profile, avatarId: UPLOADED_AVATAR_ID }),
    );
  }

  removeAvatar(): Promise<Answers['removeAvatar']> {
    return this.answers.reply('removeAvatar', undefined, () =>
      this.save({ ...this.profile, avatarId: null }),
    );
  }

  uploadDiceTexture(file: Blob): Promise<Answers['uploadDiceTexture']> {
    return this.answers.reply('uploadDiceTexture', file, () =>
      this.save({ ...this.profile, diceTextureId: UPLOADED_DICE_TEXTURE_ID }),
    );
  }

  diceTextureFromLink(url: string): Promise<Answers['diceTextureFromLink']> {
    return this.answers.reply('diceTextureFromLink', url, () =>
      this.save({ ...this.profile, diceTextureId: UPLOADED_DICE_TEXTURE_ID }),
    );
  }

  removeDiceTexture(): Promise<Answers['removeDiceTexture']> {
    return this.answers.reply('removeDiceTexture', undefined, () =>
      this.save({ ...this.profile, diceTextureId: null }),
    );
  }

  uploadBanner(file: Blob, crop?: ImageCropRect): Promise<Answers['uploadBanner']> {
    return this.answers.reply('uploadBanner', { file, crop }, () =>
      this.save({ ...this.profile, bannerId: UPLOADED_BANNER_ID }),
    );
  }

  bannerFromLink(url: string): Promise<Answers['bannerFromLink']> {
    return this.answers.reply('bannerFromLink', url, () =>
      this.save({ ...this.profile, bannerId: UPLOADED_BANNER_ID }),
    );
  }

  removeBanner(): Promise<Answers['removeBanner']> {
    return this.answers.reply('removeBanner', undefined, () =>
      this.save({ ...this.profile, bannerId: null }),
    );
  }

  private current(): { ok: true; value: ProfileDto } {
    return { ok: true, value: this.profile };
  }

  private save(profile: ProfileDto): { ok: true; value: ProfileDto } {
    this.profile = profile;
    return this.current();
  }
}

function updatedProfile(profile: ProfileDto, input: UpdateProfileRequestDto): ProfileDto {
  const colorChoice = input.color === undefined ? profile.colorChoice : input.color;
  return {
    ...profile,
    name: input.name ?? profile.name,
    bio: input.bio === undefined ? profile.bio : input.bio,
    diceNumberColor:
      input.diceNumberColor === undefined ? profile.diceNumberColor : input.diceNumberColor,
    gameSystems: input.gameSystems === undefined ? profile.gameSystems : input.gameSystems,
    playSchedule: input.playSchedule === undefined ? profile.playSchedule : input.playSchedule,
    contact: input.contact === undefined ? profile.contact : input.contact,
    colorChoice,
    color: memberColorOf(profile.id, colorChoice),
  };
}
