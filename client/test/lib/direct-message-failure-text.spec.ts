import { describe, expect, it } from 'vitest';
import { directMessageFailureText } from '@/lib/direct-message-failure-text';

describe('directMessageFailureText', () => {
  it.each([
    [{ kind: 'recipient_offline' }, 'Bia está offline. Mensagens só chegam a quem está online.'],
    [{ kind: 'sender_invisible' }, 'Você está invisível. Fique online para conversar.'],
    [{ kind: 'not_friends' }, 'Vocês não são mais amigos: a mensagem para Bia não foi enviada.'],
    [
      { kind: 'rate_limited', retryAfterSeconds: 3 },
      'Muitas mensagens seguidas. Espere 3 s e tente de novo.',
    ],
    [{ kind: 'offline' }, 'Sem conexão. A mensagem não foi enviada.'],
    [{ kind: 'unauthenticated' }, 'Sua sessão terminou. Entre de novo para conversar.'],
    [{ kind: 'invalid' }, 'A mensagem precisa ter de 1 a 2000 caracteres.'],
    [{ kind: 'unexpected' }, 'Não deu para enviar a mensagem. Tente de novo.'],
  ] as const)('%o says "%s"', (failure, text) => {
    expect(directMessageFailureText(failure, 'Bia')).toBe(text);
  });
});
