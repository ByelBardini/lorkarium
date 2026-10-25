const KIB = 1024;
const MIB = KIB * KIB;
// "1.000 KB" reads worse than "1,0 MB"; the switch happens before KB reaches four digits.
const LARGEST_KB_LABEL = 999;

const kbFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const mbFormat = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * A download size the way Windows Explorer shows it: base 1024, KB rounded up, MB with one decimal.
 * Example: `fileSizeLabel(8_808_038) // '8,4 MB'`
 */
export function fileSizeLabel(bytes: number): string {
  const kilobytes = Math.ceil(bytes / KIB);
  if (kilobytes <= LARGEST_KB_LABEL) return `${kbFormat.format(kilobytes)} KB`;
  return `${mbFormat.format(bytes / MIB)} MB`;
}
