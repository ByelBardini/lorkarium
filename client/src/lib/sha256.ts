// Synchronous on purpose: `crypto.subtle.digest` is async, and the sheet srcdoc (whose policy lists
// the hash of each script) is built during render.
import { bytesToBase64 } from './base64';

// The first 32 bits of the fractional parts of the cube roots of the first 64 primes (FIPS 180-4).
const ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

// The first 32 bits of the fractional parts of the square roots of the first 8 primes.
const INITIAL_STATE = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

const BLOCK_BYTES = 64;

function rotateRight(word: number, by: number): number {
  return (word >>> by) | (word << (32 - by));
}

// The message, a 0x80 byte, zeros up to 8 bytes short of a block boundary, then the bit length
// as a 64-bit big-endian number.
function paddedMessage(message: Uint8Array): DataView {
  const blocks = Math.ceil((message.length + 9) / BLOCK_BYTES);
  const padded = new Uint8Array(blocks * BLOCK_BYTES);
  padded.set(message);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bits = message.length * 8;
  view.setUint32(padded.length - 8, Math.floor(bits / 0x100000000));
  view.setUint32(padded.length - 4, bits >>> 0);
  return view;
}

function expandSchedule(view: DataView, offset: number, schedule: Uint32Array): void {
  for (let at = 0; at < 16; at += 1) schedule[at] = view.getUint32(offset + at * 4);
  for (let at = 16; at < 64; at += 1) {
    const w15 = schedule[at - 15] ?? 0;
    const w2 = schedule[at - 2] ?? 0;
    const s0 = rotateRight(w15, 7) ^ rotateRight(w15, 18) ^ (w15 >>> 3);
    const s1 = rotateRight(w2, 17) ^ rotateRight(w2, 19) ^ (w2 >>> 10);
    schedule[at] = (schedule[at - 16] ?? 0) + s0 + (schedule[at - 7] ?? 0) + s1;
  }
}

function compressBlock(state: Uint32Array, schedule: Uint32Array): void {
  let [a, b, c, d, e, f, g, h] = Array.from(state) as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  for (let at = 0; at < 64; at += 1) {
    const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
    const choice = (e & f) ^ (~e & g);
    const t1 = (h + s1 + choice + (ROUND_CONSTANTS[at] ?? 0) + (schedule[at] ?? 0)) | 0;
    const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
    const t2 = (s0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    [h, g, f, e, d, c, b, a] = [g, f, e, (d + t1) | 0, c, b, a, (t1 + t2) | 0];
  }
  [a, b, c, d, e, f, g, h].forEach((word, at) => (state[at] = (state[at] ?? 0) + word));
}

/** The SHA-256 digest of `message` (FIPS 180-4), as its 32 bytes.
 *
 *  Example: `sha256Bytes(new TextEncoder().encode('abc'))[0] // 0xba` */
export function sha256Bytes(message: Uint8Array): Uint8Array<ArrayBuffer> {
  const view = paddedMessage(message);
  const state = new Uint32Array(INITIAL_STATE);
  const schedule = new Uint32Array(64);
  for (let offset = 0; offset < view.byteLength; offset += BLOCK_BYTES) {
    expandSchedule(view, offset, schedule);
    compressBlock(state, schedule);
  }
  const digest = new Uint8Array(32);
  const out = new DataView(digest.buffer);
  state.forEach((word, at) => out.setUint32(at * 4, word));
  return digest;
}

/** The SHA-256 of the UTF-8 bytes of `text`, as standard base64: the value of a CSP
 *  `'sha256-…'` source (lone surrogates encode as U+FFFD, as the browser does).
 *
 *  Example: `sha256Base64('abc') // 'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0='` */
export function sha256Base64(text: string): string {
  return bytesToBase64(sha256Bytes(new TextEncoder().encode(text)));
}
