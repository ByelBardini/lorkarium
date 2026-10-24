import type { AccountSecurityFailure } from '@/services/account-security-api';
import { accountFailureMessage } from './account-messages';

/** The sentence a refusal of the recovery shows; the old address taken by another account only
 *  an admin can sort out.
 *
 *  Example: `recoveryFailureMessage({ kind: 'email_taken' }) // 'O e-mail antigo já está em outra conta. …'` */
export function recoveryFailureMessage(failure: AccountSecurityFailure): string {
  if (failure.kind === 'email_taken') {
    return 'O e-mail antigo já está em outra conta. Fale com quem administra o Lorkarium.';
  }
  return accountFailureMessage(failure);
}
