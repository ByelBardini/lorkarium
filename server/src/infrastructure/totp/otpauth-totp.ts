import { Secret, TOTP } from 'otpauth';
import type { TotpPort } from '../../modules/auth/totp.port';

const ISSUER = 'Lorkarium';
// What every authenticator app reads; anything else is ignored by some of them.
const ALGORITHM = 'SHA1';
const DIGITS = 6;
const PERIOD_SECONDS = 30;
// One step each way absorbs a phone clock a little off (RFC 6238 §5.2).
const WINDOW_STEPS = 1;
// 160 bits, the length RFC 4226 recommends for the shared secret.
const SECRET_BYTES = 20;

/** TOTP over `otpauth`.
 *
 *  Example: `new OtpauthTotp().uri(secret, 'ana') // 'otpauth://totp/Lorkarium:ana?issuer=Lorkarium&…'` */
export class OtpauthTotp implements TotpPort {
  generateSecret(): string {
    return new Secret({ size: SECRET_BYTES }).base32;
  }

  uri(secret: string, account: string): string {
    return new TOTP({
      issuer: ISSUER,
      label: account,
      secret: Secret.fromBase32(secret),
      algorithm: ALGORITHM,
      digits: DIGITS,
      period: PERIOD_SECONDS,
    }).toString();
  }

  currentStep(at: Date): number {
    return TOTP.counter({ period: PERIOD_SECONDS, timestamp: at.getTime() });
  }

  stepOf(secret: string, code: string, at: Date): number | null {
    const delta = TOTP.validate({
      token: code,
      secret: Secret.fromBase32(secret),
      algorithm: ALGORITHM,
      digits: DIGITS,
      period: PERIOD_SECONDS,
      timestamp: at.getTime(),
      window: WINDOW_STEPS,
    });
    return delta === null ? null : this.currentStep(at) + delta;
  }
}
