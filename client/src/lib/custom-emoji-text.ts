import {
  CUSTOM_EMOJI_NAME_PATTERN,
  isCatalogEmoteName,
  type PlanLimitDto,
} from '@lorkarium/contracts';
import type { CustomEmojisFailure } from '@/services/custom-emojis-api';

/** Why a name typed for a custom emoji cannot be sent, in pt-BR; `null` when it can.
 *
 *  Example: `customEmojiNameProblem('doge') // 'Esse nome já é de um emoji do catálogo.'` */
export function customEmojiNameProblem(name: string): string | null {
  if (!CUSTOM_EMOJI_NAME_PATTERN.test(name)) {
    return 'Use de 2 a 32 letras minúsculas sem acento, números ou _.';
  }
  if (isCatalogEmoteName(name)) return 'Esse nome já é de um emoji do catálogo.';
  return null;
}

/** The name as it should be typed: lower case, spaces and dashes as `_`, no colons.
 *
 *  Example: `typedCustomEmojiName(':Bora Lá:') // 'bora_lá'` */
export function typedCustomEmojiName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/:/gu, '')
    .replace(/[\s-]+/gu, '_');
}

/** "7 de 10", or "7" without a ceiling.
 *
 *  Example: `customEmojiQuotaText(7, 10) // '7 de 10'` */
export function customEmojiQuotaText(count: number, limit: number | null): string {
  return limit === null ? String(count) : `${count} de ${limit}`;
}

const FAILURE_TEXT: Readonly<
  Record<Exclude<CustomEmojisFailure['kind'], 'plan_limit' | 'rate_limited'>, string>
> = {
  name_taken: 'Você já tem um emoji com esse nome.',
  too_large: 'A imagem passa de 2 MB.',
  unsupported_image: 'Use uma imagem PNG, JPEG, WebP ou GIF.',
  not_found: 'Esse emoji não existe mais.',
  invalid: 'Esse nome não vale: use letras minúsculas, números ou _.',
  unauthenticated: 'Sua sessão terminou. Entre de novo.',
  offline: 'Sem conexão. Tente de novo.',
  unexpected: 'Algo deu errado. Tente de novo.',
};

/** The sentence a refused emoji command shows.
 *
 *  Example: `customEmojiFailureText({ kind: 'name_taken' }) // 'Você já tem um emoji com esse nome.'` */
export function customEmojiFailureText(failure: CustomEmojisFailure): string {
  if (failure.kind === 'plan_limit') return planLimitText(failure.planLimit);
  if (failure.kind === 'rate_limited') {
    return `Muitas mudanças seguidas. Tente de novo em ${failure.retryAfterSeconds} s.`;
  }
  return FAILURE_TEXT[failure.kind];
}

function planLimitText(planLimit: PlanLimitDto): string {
  if (planLimit.limit === 0)
    return 'Emojis personalizados estão disponíveis a partir do plano Apoiador.';
  return `Seu plano permite até ${planLimit.limit} emojis personalizados. Apague um ou mude de plano.`;
}
