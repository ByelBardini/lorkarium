const MEBIBYTE = 1024 * 1024;
const GIBIBYTE = 1024 * MEBIBYTE;

const DECIMAL = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** A size in bytes as a person reads it: GB from 1 GiB up, MB below it (one decimal at most).
 *
 *  Example: `byteSizeText(100 * 1024 * 1024) // '100 MB'` */
export function byteSizeText(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new RangeError(`byteSizeText expects a non-negative number of bytes, got ${bytes}`);
  }
  if (bytes >= GIBIBYTE) return `${DECIMAL.format(bytes / GIBIBYTE)} GB`;
  return `${DECIMAL.format(bytes / MEBIBYTE)} MB`;
}
