import { describe, expect, it } from 'vitest';
import { devicesLine, passwordLine, protectionSummary } from '@/features/account/security-lines';

const NOW = new Date('2026-11-12T12:00:00Z');

describe('passwordLine', () => {
  it('a password never changed says so', () => {
    expect(passwordLine(null, NOW)).toBe('Ainda é a senha da criação da conta.');
  });

  it('a changed password says how long ago', () => {
    expect(passwordLine('2026-08-12T12:00:00Z', NOW)).toBe('Trocada há 3 meses');
  });
});

describe('devicesLine', () => {
  it('one device in the singular, more in the plural', () => {
    expect(devicesLine(1)).toBe('1 aparelho conectado');
    expect(devicesLine(3)).toBe('3 aparelhos conectados');
  });
});

describe('protectionSummary', () => {
  it('2FA on is a protected account', () => {
    expect(protectionSummary(true).title).toBe('Conta protegida');
  });

  it('2FA off is basic protection and points at turning it on', () => {
    const summary = protectionSummary(false);
    expect(summary.title).toBe('Proteção básica');
    expect(summary.text).toMatch(/Ligue o 2FA/);
  });
});
