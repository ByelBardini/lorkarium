import type { SheetManifestPermissionDto, SheetTemplateManifestDto } from '@lorkarium/contracts';
import type { SheetManifestProblem } from '@/lib/sheet-template-manifest';

const PERMISSION_WORDS: Readonly<Record<SheetManifestPermissionDto, string>> = {
  'character:stats': 'Gravar CA e CD do personagem',
  'character:portrait': 'Trocar o retrato',
  'sheet:images': 'Enviar imagens',
  'documents:read': 'Ler os documentos públicos da mesa',
  'character:bars': 'Criar barras no personagem',
};

/** What a permission lets the sheet do, as the master reads it before importing.
 *
 *  Example: `sheetManifestPermissionLabel('sheet:images') // 'Enviar imagens'` */
export function sheetManifestPermissionLabel(permission: SheetManifestPermissionDto): string {
  return PERMISSION_WORDS[permission];
}

/** The bars a manifest expects, in one line ("HP (até 12), MP (até 6)"), or `null` without any.
 *
 *  Example: `sheetManifestBarsLabel(manifest) // 'HP (até 12)'` */
export function sheetManifestBarsLabel(manifest: SheetTemplateManifestDto): string | null {
  if (manifest.bars.length === 0) return null;
  return manifest.bars.map((bar) => `${bar.label} (até ${bar.max})`).join(', ');
}

/** Why the manifest tab cannot be saved, in words; the contract's detail stays as it came.
 *
 *  Example: `sheetManifestProblemMessage({ kind: 'not_json' }) // 'Manifesto inválido: o texto não é um JSON.'` */
export function sheetManifestProblemMessage(problem: SheetManifestProblem): string {
  if (problem.kind === 'not_json') return 'Manifesto inválido: o texto não é um JSON.';
  return `Manifesto inválido: ${problem.detail}`;
}

/** What the manifest tab says the sheet may ask for when it declares no permission. */
export const SHEET_MANIFEST_NO_PERMISSIONS = 'Nenhuma permissão além de valores, barras e dados.';
