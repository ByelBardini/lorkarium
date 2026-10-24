/** Hands a text to the browser as a file to save (the recovery codes' `.txt`); nothing leaves the
 *  page: the file is built from a `Blob` and its URL is revoked right after the click.
 *
 *  Example: `downloadText(recoveryCodesText(codes, '@ana'), 'lorkarium-codigos.txt')` */
export function downloadText(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
