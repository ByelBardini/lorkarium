import type { ProfileDto, UpdateProfileRequestDto } from '@lorkarium/contracts';
import { memberColorOf } from '@lorkarium/game-core';
import type { AccountLoadFailure, AccountResult } from '@/services/account-failure';
import type { ProfileApi, ProfileFailure } from '@/services/profile-api';
import { ANA } from './auth-api-fake';
import { ScriptedAnswers } from './scripted-answers';

/** Ana's own profile, matching `ANA` of the auth fake (automatic color, no photo, no bio). */
export const ANA_PROFILE: ProfileDto = {
  id: ANA.id,
  username: ANA.username,
  name: ANA.name,
  color: ANA.color,
  colorChoice: null,
  bio: null,
  avatarId: null,
  memberSince: '2026-10-01T12:00:00.000Z',
};

/** The id the server gives the next photo sent. */
export const UPLOADED_AVATAR_ID = '4f3e2d1c-0b9a-4876-a543-210fedcba987';

type Answers = {
  get: AccountResult<ProfileDto, AccountLoadFailure>;
  update: AccountResult<ProfileDto, ProfileFailure>;
  uploadAvatar: AccountResult<ProfileDto, ProfileFailure>;
  removeAvatar: AccountResult<ProfileDto, ProfileFailure>;
};

/** A `ProfileApi` that keeps a profile like the server would: an update, a photo sent or taken
 *  away changes what the next `get` answers. Any method can be scripted (`answer`, `hold`). */
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

  removeAvatar(): Promise<Answers['removeAvatar']> {
    return this.answers.reply('removeAvatar', undefined, () =>
      this.save({ ...this.profile, avatarId: null }),
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
    colorChoice,
    color: memberColorOf(profile.id, colorChoice),
  };
}
