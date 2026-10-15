import { createHash, randomBytes } from 'node:crypto';
import type { SessionTokenPort } from '../../modules/auth/session-token.port';

// 256 bits: well above the 160-bit floor for session identifiers.
const TOKEN_BYTES = 32;

/** Random session token over `node:crypto`; the database stores only its SHA-256.
 *
 *  Example: `const token = tokens.generate(); dao.insert({ id: tokens.hash(token) })` */
export class CryptoSessionToken implements SessionTokenPort {
  generate(): string {
    return randomBytes(TOKEN_BYTES).toString('base64url');
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
