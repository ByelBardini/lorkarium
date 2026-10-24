import {
  updateCampaignRequestDto,
  type CampaignCoverDto,
  type CampaignDetailDto,
  type CampaignStatusDto,
  type CampaignVisibilityDto,
  type ContentWarningDto,
  type UpdateCampaignRequestInput,
} from '@lorkarium/contracts';
import { useState } from 'react';
import { settingsFieldMessage, type SettingsField } from './campaign-settings-messages';

/** What the settings form shows: the confirmed campaign with the master's edits on top. The
 *  password is a switch plus a text that is only sent when typed. */
export type SettingsValues = Readonly<{
  name: string;
  system: string;
  status: CampaignStatusDto;
  description: string;
  visibility: CampaignVisibilityDto;
  contentWarnings: readonly ContentWarningDto[];
  tags: readonly string[];
  cover: CampaignCoverDto;
  requirePassword: boolean;
  password: string;
}>;

export type SettingsErrors = Partial<Record<SettingsField, string>>;

export type SettingsDraft = Readonly<{
  values: SettingsValues;
  errors: SettingsErrors;
  /** Some field differs from the confirmed campaign. */
  dirty: boolean;
  /** The PATCH body, only with what changed; `null` while a field is invalid or nothing changed. */
  update: UpdateCampaignRequestInput | null;
  change: (patch: Partial<SettingsValues>) => void;
  discard: () => void;
}>;

/** The campaign being edited, kept apart from the confirmed one: discarding (or a save, once the
 *  detail reloads) drops the edits and the form shows the server's campaign again.
 *
 *  Example: `const draft = useCampaignSettingsDraft(campaign); draft.change({ name: 'Vharn' })` */
export function useCampaignSettingsDraft(campaign: CampaignDetailDto): SettingsDraft {
  const [edits, setEdits] = useState<Partial<SettingsValues>>({});
  const confirmed = confirmedValues(campaign);
  const values: SettingsValues = { ...confirmed, ...edits };
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

function confirmedValues(campaign: CampaignDetailDto): SettingsValues {
  return {
    name: campaign.name,
    system: campaign.system ?? '',
    status: campaign.status,
    description: campaign.description ?? '',
    visibility: campaign.visibility,
    contentWarnings: campaign.contentWarnings,
    tags: campaign.tags,
    cover: campaign.cover,
    requirePassword: campaign.hasPassword,
    password: '',
  };
}

type Changes = { -readonly [K in keyof UpdateCampaignRequestInput]: UpdateCampaignRequestInput[K] };

function changesOf(values: SettingsValues, confirmed: SettingsValues): Changes {
  const changes: Changes = {};
  if (values.name !== confirmed.name) changes.name = values.name;
  if (values.system !== confirmed.system) changes.system = values.system;
  if (values.status !== confirmed.status) changes.status = values.status;
  if (values.description !== confirmed.description) changes.description = values.description;
  if (values.visibility !== confirmed.visibility) changes.visibility = values.visibility;
  if (!sameList(values.contentWarnings, confirmed.contentWarnings)) {
    changes.contentWarnings = [...values.contentWarnings];
  }
  if (!sameList(values.tags, confirmed.tags)) changes.tags = [...values.tags];
  if (!sameCover(values.cover, confirmed.cover)) changes.cover = values.cover;
  return { ...changes, ...passwordChange(values, confirmed.requirePassword) };
}

// Switched on with nothing typed is kept for a campaign that has a password; for one that has
// none, the empty text goes to the DTO, which refuses it and the field asks for the password.
function passwordChange(values: SettingsValues, hasPassword: boolean): Changes {
  if (!values.requirePassword) return hasPassword ? { password: null } : {};
  if (values.password !== '') return { password: values.password };
  return hasPassword ? {} : { password: '' };
}

function sameList<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function sameCover(left: CampaignCoverDto, right: CampaignCoverDto): boolean {
  if (left.kind === 'image') return right.kind === 'image' && left.assetId === right.assetId;
  if (right.kind === 'image') return false;
  return left.drawing === right.drawing && left.tone === right.tone;
}

function checkChanges(changes: Changes): {
  update: UpdateCampaignRequestInput | null;
  errors: SettingsErrors;
} {
  const parsed = updateCampaignRequestDto.safeParse(changes);
  if (parsed.success) return { update: changes, errors: {} };
  const errors: SettingsErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (isSettingsField(field)) errors[field] = settingsFieldMessage(field, changes[field] ?? '');
  }
  return { update: null, errors };
}

function isSettingsField(field: unknown): field is SettingsField {
  return field === 'name' || field === 'system' || field === 'description' || field === 'password';
}
