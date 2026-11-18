import { describe, expect, it } from 'vitest';
import { billingFailureMessage, brlOf } from '@/features/billing/billing-messages';

describe('brlOf', () => {
  it('writes cents as reais with a plain space after R$', () => {
    expect(brlOf(1490)).toBe('R$ 14,90');
    expect(brlOf(23890)).toBe('R$ 238,90');
  });
});

describe('billingFailureMessage', () => {
  it('offline asks to try again when the internet is back', () => {
    expect(billingFailureMessage({ kind: 'offline' }, 'abrir o pagamento')).toContain(
      'Sem conexão',
    );
  });

  it('a 429 says the seconds to wait', () => {
    const failure = { kind: 'rate_limited', retryAfterSeconds: 42 } as const;
    expect(billingFailureMessage(failure, 'abrir o pagamento')).toContain('42 s');
  });

  it('a known refusal has its own sentence', () => {
    const failure = { kind: 'refused', code: 'ALREADY_REFUNDED' } as const;
    expect(billingFailureMessage(failure, 'reembolsar')).toBe('Esse pagamento já foi reembolsado.');
  });

  it('Pix off on the payment account points to the card', () => {
    const failure = { kind: 'refused', code: 'PIX_UNAVAILABLE' } as const;
    expect(billingFailureMessage(failure, 'abrir o pagamento')).toBe(
      'O Pix está indisponível no momento. Assine pelo cartão ou tente mais tarde.',
    );
  });

  it('an unknown refusal or an unexpected answer names what was being done', () => {
    expect(billingFailureMessage({ kind: 'refused', code: null }, 'reembolsar')).toBe(
      'Não deu para reembolsar agora.',
    );
    expect(billingFailureMessage({ kind: 'unexpected' }, 'abrir o pagamento')).toBe(
      'Não deu para abrir o pagamento agora.',
    );
  });
});
