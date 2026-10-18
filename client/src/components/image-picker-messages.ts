import {
  NOT_MEMBER_MESSAGE,
  OFFLINE_MESSAGE,
  UNEXPECTED_MESSAGE,
} from '@/features/campaigns/campaign-messages';
import { IMAGE_SIZE_PROBLEM, IMAGE_TYPE_PROBLEM } from '@/lib/image-file';
import type { AssetsFailure } from '@/services/assets-api';

const MESSAGE: Readonly<Record<Exclude<AssetsFailure['kind'], 'rate_limited'>, string>> = {
  too_large: IMAGE_SIZE_PROBLEM,
  unsupported: IMAGE_TYPE_PROBLEM,
  link_not_image: 'Esse link não é de uma imagem. Abra a imagem e copie o endereço dela.',
  link_blocked: 'Esse link não pode ser usado.',
  link_unreachable: 'Não deu para baixar esse link. Confira o endereço.',
  invalid: 'Use um link que comece com http:// ou https://.',
  not_found: NOT_MEMBER_MESSAGE,
  unauthenticated: 'Sua sessão terminou. Entre de novo.',
  offline: OFFLINE_MESSAGE,
  unexpected: UNEXPECTED_MESSAGE,
};

/** Why an image could not be sent, as the person reads it.
 *
 *  Example: `imageFailureMessage({ kind: 'rate_limited', retryAfterSeconds: 12 }) // 'Muitos envios seguidos. Espere 12 s.'` */
export function imageFailureMessage(failure: AssetsFailure): string {
  if (failure.kind === 'rate_limited') {
    return `Muitos envios seguidos. Espere ${failure.retryAfterSeconds} s.`;
  }
  return MESSAGE[failure.kind];
}
