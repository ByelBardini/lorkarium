import {
  CAMPAIGN_DESCRIPTION_MAX_LENGTH,
  CAMPAIGN_LABEL_MAX_LENGTH,
  CAMPAIGN_NAME_MAX_LENGTH,
  CAMPAIGN_PASSWORD_MAX_LENGTH,
  CAMPAIGN_PASSWORD_MIN_LENGTH,
  type CampaignVisibilityDto,
} from '@lorkarium/contracts';

export type CreateField = 'name' | 'system' | 'status' | 'description' | 'password';

export type CreateValues = Record<CreateField, string> & { visibility: CampaignVisibilityDto };

/** The text fields of "Nova mesa" in screen order: the first invalid one gets the focus. */
export const CREATE_FIELDS: readonly CreateField[] = [
  'name',
  'system',
  'status',
  'description',
  'password',
];

/** The message under a field the `createCampaignRequestDto` refused; limits come from contracts.
 *
 *  Example: `createFieldMessage('name', { ...values, name: '' }) // 'Informe o nome da mesa.'` */
export function createFieldMessage(field: CreateField, values: CreateValues): string {
  if (field === 'name') {
    return values.name.trim() === ''
      ? 'Informe o nome da mesa.'
      : `O nome pode ter no máximo ${CAMPAIGN_NAME_MAX_LENGTH} caracteres.`;
  }
  if (field === 'description') {
    return `A descrição pode ter no máximo ${CAMPAIGN_DESCRIPTION_MAX_LENGTH} caracteres.`;
  }
  if (field === 'password') {
    return values.password.length < CAMPAIGN_PASSWORD_MIN_LENGTH
      ? `A senha precisa de pelo menos ${CAMPAIGN_PASSWORD_MIN_LENGTH} caracteres.`
      : `A senha pode ter no máximo ${CAMPAIGN_PASSWORD_MAX_LENGTH} caracteres.`;
  }
  return `Use no máximo ${CAMPAIGN_LABEL_MAX_LENGTH} caracteres.`;
}
