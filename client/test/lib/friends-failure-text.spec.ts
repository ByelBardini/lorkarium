import { describe, expect, it } from 'vitest';
import { friendsFailureText } from '@/lib/friends-failure-text';

describe('friendsFailureText', () => {
  it('quotes the @ typed in the refusals about it', () => {
    expect(friendsFailureText({ kind: 'user_not_found' }, 'x')).toBe('Não achamos ninguém com @x.');
    expect(friendsFailureText({ kind: 'already_friends' }, 'bia')).toBe(
      'Você e @bia já são amigos.',
    );
  });

  it('a ceiling quotes its number', () => {
    expect(friendsFailureText({ kind: 'friend_limit', limit: 200 })).toBe(
      'Você chegou ao teto de 200 amigos.',
    );
    expect(friendsFailureText({ kind: 'outgoing_request_limit', limit: 50 })).toContain('50');
  });

  it('the common failures have their own sentence', () => {
    expect(friendsFailureText({ kind: 'offline' })).toBe('Sem conexão. Tente de novo.');
    expect(friendsFailureText({ kind: 'rate_limited', retryAfterSeconds: 3 })).toContain('3 s');
    expect(friendsFailureText({ kind: 'unexpected' })).toBe('Algo deu errado. Tente de novo.');
  });
});
