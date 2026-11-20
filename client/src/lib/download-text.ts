/** Hands a text to the browser as a file to save (the recovery codes' `.txt`, an exported sheet
 *  template); nothing leaves the page: the file is built from a `Blob` of the given MIME `type`
 *  (plain UTF-8 text by default) and its URL is revoked right after the click.
 *
 *  Example: `downloadText(recoveryCodesText(codes, '@ana'), 'lorkarium-codigos.txt')` */
export function downloadText(
  text: string,
  fileName: string,
  type: string = 'text/plain;charset=utf-8',
): void {
  downloadBlob(new Blob([text], { type }), fileName);
}

/** Hands a `Blob` already in memory (the ZIP of "Baixar meus dados") to the browser as a file,
 *  by the same `<a download>` click, which the desktop shell saves too.
 *
 *  Example: `downloadBlob(archive.blob, 'lorkarium-dados-bia-2026-11-19.zip')` */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
