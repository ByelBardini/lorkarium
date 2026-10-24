import { randomInt } from 'node:crypto';
import { RECOVERY_CODE_ALPHABET } from '@lorkarium/contracts';
import type { RecoveryCodePort } from '../../modules/account-security/recovery-code.port';

const HALF_LENGTH = 5;

/** Recovery codes from `node:crypto`'s uniform `randomInt` (no modulo bias).
 *
 *  Example: `new CryptoRecoveryCode().generate() // 'k7m2p-9qrst'` */
export class CryptoRecoveryCode implements RecoveryCodePort {
  generate(): string {
    return `${randomHalf()}-${randomHalf()}`;
  }
}

function randomHalf(): string {
  let half = '';
  for (let position = 0; position < HALF_LENGTH; position += 1) {
    half += RECOVERY_CODE_ALPHABET.charAt(randomInt(RECOVERY_CODE_ALPHABET.length));
  }
  return half;
}
