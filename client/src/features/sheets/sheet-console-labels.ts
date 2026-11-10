import type { SheetScriptPosition } from '@/sheet-sandbox/sheet-srcdoc';

/** "2 erros", "1 erro", "Sem erros".
 *
 *  Example: `consoleErrorCountLabel(1) // "1 erro"` */
export function consoleErrorCountLabel(errors: number): string {
  if (errors === 0) return 'Sem erros';
  return errors === 1 ? '1 erro' : `${errors} erros`;
}

/** "a.js, linha 3, coluna 9": which JS file of the template an error came from, and where.
 *
 *  Example: `consolePositionLabel({ path: 'a.js', line: 3, column: 9 })` */
export function consolePositionLabel(position: SheetScriptPosition): string {
  return `${position.path}, linha ${position.line}, coluna ${position.column}`;
}
