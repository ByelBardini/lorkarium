import {
  CAMPAIGN_DESCRIPTION_MAX_LENGTH,
  CAMPAIGN_LABEL_MAX_LENGTH,
  CAMPAIGN_NAME_MAX_LENGTH,
  CAMPAIGN_PASSWORD_MAX_LENGTH,
  CAMPAIGN_PASSWORD_MIN_LENGTH,
  type CampaignStatusDto,
  type CampaignVisibilityDto,
  type DrawnCampaignCoverDto,
} from '@lorkarium/contracts';

export type CreateField = 'name' | 'system' | 'description' | 'password';

export type CreateValues = Record<CreateField, string> &
  Readonly<{
    status: CampaignStatusDto;
    visibility: CampaignVisibilityDto;
    cover: DrawnCampaignCoverDto;
    /** The "Pedir senha para entrar" switch: off, the password is not sent. */
    usePassword: boolean;
  }>;

/** The text fields of "Nova mesa" in screen order: the first invalid one gets the focus. */
export const CREATE_FIELDS: readonly CreateField[] = ['name', 'system', 'description', 'password'];

/** Systems one click away under the "Sistema" field; any other is typed. */
export const SYSTEM_SUGGESTIONS: readonly string[] = [
  'D&D 5e',
  'Tormenta20',
  'Ordem Paranormal',
  'Pathfinder 2e',
  'Call of Cthulhu',
  'Sistema próprio',
];

/** What "Mesa criada" suggests doing next, in order. */
export const CREATED_NEXT_STEPS: readonly string[] = [
  'Passe o código (e a senha, se tiver) para quem vai jogar.',
  'Monte o primeiro grid na biblioteca da mesa.',
  'Ajuste capa, avisos de conteúdo e tags nas configurações.',
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
