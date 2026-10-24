import {
  updateProfileRequestDto,
  type ProfileDto,
  type UpdateProfileRequestDto,
} from '@lorkarium/contracts';
import type { MemberColor } from '@lorkarium/game-core';
import { useState } from 'react';
import { FIELD_MESSAGES } from './account-messages';

/** What the profile form shows: the confirmed profile with the person's edits on top. */
export type ProfileDraftValues = Readonly<{ name: string; color: MemberColor; bio: string }>;

export type ProfileDraftErrors = Partial<Record<'name' | 'bio', string>>;

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
  };
}

function changesOf(
  values: ProfileDraftValues,
  confirmed: ProfileDraftValues,
): Partial<ProfileDraftValues> {
  return {
    ...(values.name === confirmed.name ? {} : { name: values.name }),
    ...(values.color === confirmed.color ? {} : { color: values.color }),
    ...(values.bio === confirmed.bio ? {} : { bio: values.bio }),
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
  return { update: null, errors };
}
