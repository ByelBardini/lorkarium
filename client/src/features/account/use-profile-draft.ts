import {
  PROFILE_CONTACT_MAX_LENGTH,
  PROFILE_GAME_SYSTEMS_MAX_LENGTH,
  PROFILE_PLAY_SCHEDULE_MAX_LENGTH,
  updateProfileRequestDto,
  type MemberColorDto,
  type ProfileDto,
  type UpdateProfileRequestDto,
} from '@lorkarium/contracts';
import { useState } from 'react';
import { FIELD_MESSAGES } from './account-messages';

/** What the profile form shows: the confirmed profile with the person's edits on top.
 *  `diceNumberColor` is `null` while the number color is the automatic one. */
export type ProfileDraftValues = Readonly<{
  name: string;
  color: MemberColorDto;
  bio: string;
  diceNumberColor: string | null;
  gameSystems: string;
  playSchedule: string;
  contact: string;
}>;

/** The free texts of the profile shown on the card, each with its own ceiling. */
export type ProfilePreferenceField = 'gameSystems' | 'playSchedule' | 'contact';

/** The ceiling of each game preference, from the contracts.
 *
 *  Example: `PREFERENCE_MAX_LENGTH.contact // 200` */
export const PREFERENCE_MAX_LENGTH: Readonly<Record<ProfilePreferenceField, number>> = {
  gameSystems: PROFILE_GAME_SYSTEMS_MAX_LENGTH,
  playSchedule: PROFILE_PLAY_SCHEDULE_MAX_LENGTH,
  contact: PROFILE_CONTACT_MAX_LENGTH,
};

const PREFERENCE_FIELDS = Object.keys(PREFERENCE_MAX_LENGTH) as ProfilePreferenceField[];

export type ProfileDraftErrors = Partial<Record<'name' | 'bio' | ProfilePreferenceField, string>>;

export type ProfileDraft = Readonly<{
  values: ProfileDraftValues;
  errors: ProfileDraftErrors;
  /** Some field differs from the confirmed profile. */
  dirty: boolean;
  /** The PATCH body, only with what changed; `null` while a field is invalid or nothing changed. */
  update: UpdateProfileRequestDto | null;
  change: (patch: Partial<ProfileDraftValues>) => void;
  discard: () => void;
}>;

/** The profile being edited, kept apart from the confirmed one: discarding (or a save, once the
 *  account reloads) drops the edits and the form shows the server's profile again.
 *
 *  Example: `const draft = useProfileDraft(profile); draft.change({ name: 'Bia' })` */
export function useProfileDraft(profile: ProfileDto): ProfileDraft {
  const [edits, setEdits] = useState<Partial<ProfileDraftValues>>({});
  const confirmed = confirmedValues(profile);
  const values = { ...confirmed, ...edits };
  const changes = changesOf(values, confirmed);
  const dirty = Object.keys(changes).length > 0;
  const checked = dirty ? checkChanges(changes) : { update: null, errors: {} };
  return {
    values,
    errors: checked.errors,
    dirty,
    update: checked.update,
    change: (patch) => setEdits((current) => ({ ...current, ...patch })),
    discard: () => setEdits({}),
  };
}

function confirmedValues(profile: ProfileDto): ProfileDraftValues {
  return {
    name: profile.name,
    color: profile.colorChoice ?? profile.color,
    bio: profile.bio ?? '',
    diceNumberColor: profile.diceNumberColor,
    gameSystems: profile.gameSystems ?? '',
    playSchedule: profile.playSchedule ?? '',
    contact: profile.contact ?? '',
  };
}

function changesOf(
  values: ProfileDraftValues,
  confirmed: ProfileDraftValues,
): Partial<ProfileDraftValues> {
  const preferences = PREFERENCE_FIELDS.filter((field) => values[field] !== confirmed[field]);
  return {
    ...Object.fromEntries(preferences.map((field) => [field, values[field]])),
    ...(values.name === confirmed.name ? {} : { name: values.name }),
    ...(values.color === confirmed.color ? {} : { color: values.color }),
    ...(values.bio === confirmed.bio ? {} : { bio: values.bio }),
    ...(values.diceNumberColor === confirmed.diceNumberColor
      ? {}
      : { diceNumberColor: values.diceNumberColor }),
  };
}

function checkChanges(changes: Partial<ProfileDraftValues>): {
  update: UpdateProfileRequestDto | null;
  errors: ProfileDraftErrors;
} {
  const parsed = updateProfileRequestDto.safeParse(changes);
  if (parsed.success) return { update: parsed.data, errors: {} };
  const fields = new Set(parsed.error.issues.map((issue) => issue.path[0]));
  const errors: ProfileDraftErrors = {};
  if (fields.has('name')) {
    errors.name = changes.name?.trim() === '' ? FIELD_MESSAGES.emptyName : FIELD_MESSAGES.longName;
  }
  if (fields.has('bio')) errors.bio = FIELD_MESSAGES.longBio;
  for (const field of PREFERENCE_FIELDS) {
    if (fields.has(field)) errors[field] = FIELD_MESSAGES.longText(PREFERENCE_MAX_LENGTH[field]);
  }
  return { update: null, errors };
}
