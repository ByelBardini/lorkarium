import type { FriendsFailure } from '@/services/friends-api';

/** The sentence the friends screen shows when a command was refused (pt-BR); `username` is the
 *  @ the person typed, quoted by the refusals about it.
 *
 *  Example: `friendsFailureText({ kind: 'user_not_found' }, 'x') // 'Não achamos ninguém com @x.'` */
export function friendsFailureText(failure: FriendsFailure, username = ''): string {
  switch (failure.kind) {
    case 'user_not_found':
      return `Não achamos ninguém com @${username}.`;
    case 'already_friends':
      return `Você e @${username} já são amigos.`;
    case 'request_already_sent':
      return `Você já mandou um pedido pra @${username}.`;
    case 'request_to_self':
      return 'Esse @ é o seu.';
    case 'user_blocked_by_you':
      return `Você bloqueou @${username}. Desbloqueie para mandar o pedido.`;
    case 'already_blocked':
      return `@${username} já está bloqueado.`;
    case 'friend_limit':
      return `Você chegou ao teto de ${failure.limit} amigos.`;
    case 'outgoing_request_limit':
      return `Você chegou ao teto de ${failure.limit} pedidos enviados esperando resposta.`;
    case 'block_limit':
      return `Você chegou ao teto de ${failure.limit} bloqueados.`;
    default:
      return commonFailureText(failure);
  }
}

function commonFailureText(failure: FriendsFailure): string {
  switch (failure.kind) {
    case 'request_not_found':
      return 'Esse pedido não existe mais.';
    case 'friend_not_found':
      return 'Essa pessoa já não está entre seus amigos.';
    case 'block_not_found':
      return 'Essa pessoa já não está bloqueada.';
    case 'invalid':
      return 'Esse @ não é válido.';
    case 'rate_limited':
      return `Muitas tentativas seguidas. Espere ${failure.retryAfterSeconds} s e tente de novo.`;
    case 'offline':
      return 'Sem conexão. Tente de novo.';
    case 'unauthenticated':
      return 'Sua sessão terminou. Entre de novo.';
    default:
      return 'Algo deu errado. Tente de novo.';
  }
}
