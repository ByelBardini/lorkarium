import { describe, expect, it } from 'vitest';
import { signedInToSignUp, signUpFailureMessage } from '@/features/sign-up/sign-up-messages';

describe('signUpFailureMessage', () => {
  it.each([
    [30, 'Muitos pedidos. Tente de novo em 1 min.'],
    [60, 'Muitos pedidos. Tente de novo em 1 min.'],
    [61, 'Muitos pedidos. Tente de novo em 2 min.'],
    [3600, 'Muitos pedidos. Tente de novo em 60 min.'],
  ])('a wait of %i s is said in whole minutes, rounded up: %s', (seconds, sentence) => {
    expect(signUpFailureMessage({ kind: 'rate_limited', retryAfterSeconds: seconds })).toBe(
      sentence,
    );
  });

  it.each([
    ['registration_closed', 'O cadastro está fechado no momento.'],
    ['human_check_failed', 'A verificação não passou. Faça de novo e envie.'],
    ['invalid', 'Confira o campo e tente de novo.'],
  ] as const)('%s says "%s"', (kind, sentence) => {
    expect(signUpFailureMessage({ kind })).toBe(sentence);
  });
});

describe('signedInToSignUp', () => {
  it('names the @ signed in and asks to leave first', () => {
    expect(signedInToSignUp('caio')).toBe(
      'Você já está conectado como @caio. Para criar outra conta, saia primeiro.',
    );
  });
});
