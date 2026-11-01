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
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
