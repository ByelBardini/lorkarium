import { describe, expect, it } from 'vitest';
import {
  dataExportFailureMessage,
  nextExportMessage,
  paymentExportFailureMessage,
  paymentExportFileName,
} from '@/features/account/data-export-messages';

const NOW = new Date(2026, 10, 19, 10, 0);

describe('nextExportMessage', () => {
  it('a wait that ends today names only the hour', () => {
    expect(nextExportMessage(NOW, 16200)).toBe('Você poderá baixar de novo às 14:30.');
  });

  it('a wait that crosses midnight says "amanhã"', () => {
    expect(nextExportMessage(NOW, 20 * 3600)).toBe('Você poderá baixar de novo amanhã às 06:00.');
  });
});

describe('dataExportFailureMessage', () => {
  it.each([
    [
      { kind: 'offline' } as const,
      'Sem conexão com o servidor. Confira sua internet e tente de novo.',
    ],
    [
      { kind: 'unexpected' } as const,
      'Não foi possível preparar o arquivo agora. Tente de novo em instantes.',
    ],
  ])('a %o failure reads "%s"', (failure, message) => {
    expect(dataExportFailureMessage(failure, NOW)).toBe(message);
  });
});

describe('paymentExportFailureMessage', () => {
  it('a 429 of the billing service tells the seconds to wait', () => {
    expect(paymentExportFailureMessage({ kind: 'rate_limited', retryAfterSeconds: 30 })).toBe(
      'Muitos pedidos seguidos. Tente de novo em 30 s.',
    );
  });

  it('a refusal by code reads as the service not answering', () => {
    expect(paymentExportFailureMessage({ kind: 'refused', code: 'ACCOUNT_SUSPENDED' })).toBe(
      'O serviço de cobrança não respondeu agora. Tente de novo em instantes.',
    );
  });
});

describe('paymentExportFileName', () => {
  it('carries the @ and the day of the person', () => {
    expect(paymentExportFileName('ana', new Date(2026, 0, 5, 23, 59))).toBe(
      'lorkarium-pagamentos-ana-2026-01-05.json',
    );
  });
});
