import { describe, expect, it } from 'vitest';
import { roleChangeFailureMessage } from '@/features/sessions/use-member-role-change';

describe('roleChangeFailureMessage', () => {
  it('a member who is no longer at the table has their own words', () => {
    expect(roleChangeFailureMessage({ kind: 'member_not_found' })).toBe(
      'Essa pessoa não está mais na mesa.',
    );
  });

  it.each([
    [{ kind: 'forbidden' } as const, 'Só o mestre da mesa pode fazer isso.'],
    [{ kind: 'not_found' } as const, 'Essa mesa não existe ou você não participa dela.'],
    [
      { kind: 'offline' } as const,
      'Sem conexão com o servidor. Confira sua internet e tente de novo.',
    ],
    [
      { kind: 'rate_limited', retryAfterSeconds: 30 } as const,
      'Muitas tentativas. Tente de novo em 30 s.',
    ],
  ])('the other refusals read as the commands of the master (%o)', (failure, message) => {
    expect(roleChangeFailureMessage(failure)).toBe(message);
  });
});
