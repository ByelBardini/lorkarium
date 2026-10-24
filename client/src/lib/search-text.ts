/** A text folded for a search: no accent, no case, so "ossuario" finds "Ossuário".
 *
 *  Example: `searchText('Ossuário') // 'ossuario'` */
export function searchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
