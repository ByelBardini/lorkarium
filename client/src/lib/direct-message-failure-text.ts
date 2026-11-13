import { DIRECT_MESSAGE_MAX_LENGTH } from '@lorkarium/contracts';
import type { DirectMessageFailure } from '@/services/direct-message-commands';

/** The sentence under the message field when a direct message did not go (pt-BR).
 *
 *  Example: `directMessageFailureText({ kind: 'recipient_offline' }, 'Bia') // 'Bia está offline. …'` */
export function directMessageFailureText(
  failure: DirectMessageFailure,
  friendName: string,
): string {
  switch (failure.kind) {
    case 'recipient_offline':
      return `${friendName} está offline. Mensagens só chegam a quem está online.`;
    case 'sender_invisible':
      return 'Você está invisível. Fique online para conversar.';
    case 'not_friends':
      return `Vocês não são mais amigos: a mensagem para ${friendName} não foi enviada.`;
    case 'rate_limited':
      return `Muitas mensagens seguidas. Espere ${failure.retryAfterSeconds} s e tente de novo.`;
    case 'offline':
      return 'Sem conexão. A mensagem não foi enviada.';
    case 'unauthenticated':
      return 'Sua sessão terminou. Entre de novo para conversar.';
    case 'invalid':
      return `A mensagem precisa ter de 1 a ${DIRECT_MESSAGE_MAX_LENGTH} caracteres.`;
    case 'unexpected':
      return 'Não deu para enviar a mensagem. Tente de novo.';
  }
}
