import type { SheetCodePosition } from '@/sheet-sandbox/sheet-srcdoc';

/** "2 erros", "1 erro", "Sem erros".
 *
 *  Example: `consoleErrorCountLabel(1) // "1 erro"` */
export function consoleErrorCountLabel(errors: number): string {
  if (errors === 0) return 'Sem erros';
  return errors === 1 ? '1 erro' : `${errors} erros`;
}

/** "linha 3, coluna 9": where in the editor's JS file an error came from.
 *
 *  Example: `consolePositionLabel({ line: 3, column: 9 })` */
export function consolePositionLabel(position: SheetCodePosition): string {
  return `linha ${position.line}, coluna ${position.column}`;
}
