import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import type { CipherPurpose, DataCipherPort } from '../../modules/auth/data-cipher.port';

// The version prefix lets a future key rotation tell old values from new ones (`v2.` next).
const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
// 96 bits: the IV size GCM is specified for (NIST SP 800-38D).
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HKDF_SALT = Buffer.from('lorkarium/data-cipher', 'utf8');

/** AES-256-GCM per purpose over `node:crypto`: a subkey per purpose by HKDF-SHA256 from the master
 *  key, `v1.<iv>.<ciphertext>.<tag>` in base64url, the context as additional authenticated data,
 *  and the blind index as HMAC-SHA256 hex (64 characters) with a subkey of its own.
 *
 *  Example: `new AesGcmDataCipher(env.dataEncryptionKey).seal('user-email', 'bia@x.com', userId)` */
export class AesGcmDataCipher implements DataCipherPort {
  private readonly subkeys = new Map<string, Buffer>();

  constructor(private readonly masterKey: Buffer) {
    if (masterKey.length !== KEY_BYTES) {
      throw new Error(`data encryption key has ${masterKey.length} bytes; expected ${KEY_BYTES}`);
    }
  }

  seal(purpose: CipherPurpose, plaintext: string, context: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.subkeyOf(`seal:${purpose}`), iv);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [VERSION, iv, body, cipher.getAuthTag()].map(base64urlOf).join('.');
  }

  open(purpose: CipherPurpose, sealed: string, context: string): string {
    const { iv, body, tag } = partsOf(purpose, sealed);
    const decipher = createDecipheriv(ALGORITHM, this.subkeyOf(`seal:${purpose}`), iv);
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(tag);
    try {
      return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
    } catch {
      throw new Error(
        `cannot open a ${purpose} value: authentication failed (another key, purpose or context, or tampered data)`,
      );
    }
  }

  index(purpose: CipherPurpose, value: string): string {
    return createHmac('sha256', this.subkeyOf(`index:${purpose}`))
      .update(value)
      .digest('hex');
  }

  private subkeyOf(info: string): Buffer {
    const known = this.subkeys.get(info);
    if (known) return known;
    const derived = Buffer.from(hkdfSync('sha256', this.masterKey, HKDF_SALT, info, KEY_BYTES));
    this.subkeys.set(info, derived);
    return derived;
  }
}

type SealedParts = Readonly<{ iv: Buffer; body: Buffer; tag: Buffer }>;

function partsOf(purpose: CipherPurpose, sealed: string): SealedParts {
  const [version, iv, body, tag, ...rest] = sealed.split('.');
  if (version !== VERSION) {
    throw new Error(`unsupported ${purpose} cipher version "${version}"; expected ${VERSION}`);
  }
  if (iv === undefined || body === undefined || tag === undefined || rest.length > 0) {
    throw new Error(`malformed ${purpose} value; expected ${VERSION}.<iv>.<ciphertext>.<tag>`);
  }
  const parts = { iv: bytesOf(iv), body: bytesOf(body), tag: bytesOf(tag) };
  if (parts.iv.length !== IV_BYTES || parts.tag.length !== TAG_BYTES) {
    throw new Error(
      `malformed ${purpose} value; expected a ${IV_BYTES}-byte iv and a ${TAG_BYTES}-byte tag`,
    );
  }
  return parts;
}

function base64urlOf(part: string | Buffer): string {
  return typeof part === 'string' ? part : part.toString('base64url');
}

function bytesOf(part: string): Buffer {
  return Buffer.from(part, 'base64url');
}
