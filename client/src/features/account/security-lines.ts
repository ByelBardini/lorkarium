import { sinceLabel } from '@/lib/since-label';

/** How the password stands: the age of the last change, or that it never changed.
 *
 *  Example: `passwordLine('2026-08-12T10:00:00Z', now) // 'Trocada há 3 meses'` */
export function passwordLine(changedAt: string | null, now: Date): string {
  if (changedAt === null) return 'Ainda é a senha da criação da conta.';
  return `Trocada ${sinceLabel(changedAt, now)}`;
}

/** How many devices are signed in, in words.
 *
 *  Example: `devicesLine(2) // '2 aparelhos conectados'` */
export function devicesLine(count: number): string {
  return count === 1 ? '1 aparelho conectado' : `${count} aparelhos conectados`;
}

/** The headline and the sentence of "Proteção da conta": 2FA is what makes it protected.
 *
 *  Example: `protectionSummary(false).title // 'Proteção básica'` */
export function protectionSummary(twoFactorOn: boolean): Readonly<{ title: string; text: string }> {
  if (twoFactorOn) {
    return {
      title: 'Conta protegida',
      text: 'Para entrar, além da senha, é preciso o código do seu app autenticador.',
    };
  }
  return {
    title: 'Proteção básica',
    text: 'Só a senha guarda a sua conta. Ligue o 2FA para pedir também um código do app a cada entrada.',
  };
}
