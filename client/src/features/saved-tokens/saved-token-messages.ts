import {
  SAVED_TOKEN_FOLDERS_MAX,
  SAVED_TOKENS_MAX,
  type SavedTokenBodyDto,
} from '@lorkarium/contracts';
import {
  INVALID_MESSAGE,
  NOT_MEMBER_MESSAGE,
  OFFLINE_MESSAGE,
  UNEXPECTED_MESSAGE,
} from '@/features/campaigns/campaign-messages';
import { planLimitMessage } from '@/lib/plan-limit-message';
import type { SavedTokensFailure } from '@/services/saved-tokens-api';

export const SAVED_TOKENS_TITLE = 'Tokens salvos';
export const SAVE_TOKEN_ITEM = 'Salvar na minha lista…';
export const SAVED_TOKENS_EMPTY =
  'Nenhum token salvo. Clique com o botão direito num token do mapa e escolha “Salvar na minha lista”.';
export const SPECTATOR_SAVES_NOTHING = 'Quem assiste à mesa não guarda tokens.';
export const SPAWN_HOW_TO = 'Clique para pôr no mapa, ou arraste até a casa.';
export const SPAWN_LOCKED_HINT = 'O mestre não liberou criar tokens nesta mesa.';
export const NO_FOLDER_LABEL = 'Sem pasta';

/** The line over the list while a saved token is armed.
 *
 *  Example: `armedHint('Zumbi') // 'Clique no mapa para pôr Zumbi · Esc para parar'` */
export function armedHint(name: string): string {
  return `Clique no mapa para pôr ${name} · Esc para parar`;
}

const FAILURES: Readonly<
  Record<Exclude<SavedTokensFailure['kind'], 'rate_limited' | 'plan_limit'>, string>
> = {
  forbidden: SPECTATOR_SAVES_NOTHING,
  not_found: NOT_MEMBER_MESSAGE,
  invalid: INVALID_MESSAGE,
  unauthenticated: 'Sua sessão terminou. Entre de novo para salvar.',
  offline: OFFLINE_MESSAGE,
  unexpected: UNEXPECTED_MESSAGE,
  limit: `Você já tem ${SAVED_TOKENS_MAX} tokens salvos. Apague um para salvar outro.`,
  folder_name_taken: 'Já existe uma pasta com esse nome.',
  folder_limit: `Você já tem ${SAVED_TOKEN_FOLDERS_MAX} pastas. Apague uma para criar outra.`,
  folder_not_found: 'Essa pasta não existe mais.',
  image_not_found: 'Uma imagem desse token não está mais na mesa.',
};

/** The refusal of a saved-token call, in pt-BR.
 *
 *  Example: `savedTokenFailureMessage({ kind: 'folder_name_taken' }) // 'Já existe uma pasta com esse nome.'` */
export function savedTokenFailureMessage(failure: SavedTokensFailure): string {
  if (failure.kind === 'plan_limit') return planLimitMessage(failure.planLimit);
  if (failure.kind === 'rate_limited') {
    return `Muitas ações seguidas. Espere ${failure.retryAfterSeconds} s.`;
  }
  return FAILURES[failure.kind];
}

const NUMBER = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** The line under a saved token's name: its size and its first bar, as a glance at what spawns.
 *
 *  Example: `savedTokenDetail(zombie.token) // '1×1 · PV 12/12'` */
export function savedTokenDetail(
  token: Pick<SavedTokenBodyDto, 'width' | 'height'> &
    Readonly<{
      bars: readonly Pick<SavedTokenBodyDto['bars'][number], 'label' | 'current' | 'max'>[];
    }>,
): string {
  const size = `${NUMBER.format(token.width)}×${NUMBER.format(token.height)}`;
  const [bar] = token.bars;
  if (!bar) return size;
  return `${size} · ${bar.label} ${NUMBER.format(bar.current)}/${NUMBER.format(bar.max)}`;
}
