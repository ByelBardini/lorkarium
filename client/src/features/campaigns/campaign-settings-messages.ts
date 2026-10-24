import {
  CAMPAIGN_DESCRIPTION_MAX_LENGTH,
  CAMPAIGN_LABEL_MAX_LENGTH,
  CAMPAIGN_NAME_MAX_LENGTH,
  CAMPAIGN_PASSWORD_MAX_LENGTH,
  CAMPAIGN_PASSWORD_MIN_LENGTH,
} from '@lorkarium/contracts';

/** The text fields of the settings tab the `updateCampaignRequestDto` can refuse. */
export type SettingsField = 'name' | 'system' | 'description' | 'password';

/** The message under a settings field the DTO refused, from what was typed in it; limits come
 *  from contracts.
 *
 *  Example: `settingsFieldMessage('name', '  ') // 'Informe o nome da mesa.'` */
export function settingsFieldMessage(field: SettingsField, typed: string): string {
  if (field === 'name') {
    return typed.trim() === ''
      ? 'Informe o nome da mesa.'
      : `O nome pode ter no máximo ${CAMPAIGN_NAME_MAX_LENGTH} caracteres.`;
  }
  if (field === 'password') return passwordMessage(typed);
  if (field === 'description') {
    return `A descrição pode ter no máximo ${CAMPAIGN_DESCRIPTION_MAX_LENGTH} caracteres.`;
  }
  return `Use no máximo ${CAMPAIGN_LABEL_MAX_LENGTH} caracteres.`;
}

function passwordMessage(typed: string): string {
  if (typed === '') return 'Informe a senha da mesa.';
  return typed.length < CAMPAIGN_PASSWORD_MIN_LENGTH
    ? `A senha precisa de pelo menos ${CAMPAIGN_PASSWORD_MIN_LENGTH} caracteres.`
    : `A senha pode ter no máximo ${CAMPAIGN_PASSWORD_MAX_LENGTH} caracteres.`;
}
