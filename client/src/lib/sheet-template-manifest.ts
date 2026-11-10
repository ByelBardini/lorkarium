import { sheetTemplateManifestDto, type SheetTemplateManifestDto } from '@lorkarium/contracts';

export type SheetManifestProblem =
  Readonly<{ kind: 'not_json' }> | Readonly<{ kind: 'invalid'; detail: string }>;

export type SheetManifestReading =
  | Readonly<{ ok: true; manifest: SheetTemplateManifestDto }>
  | Readonly<{ ok: false; problem: SheetManifestProblem }>;

/** The manifest as the editor shows it: indented JSON, the same text for the same manifest; the
 *  assets only when there are any, so a manifest without them reads as it always did.
 *
 *  Example: `sheetManifestText({ permissions: [], bars: [], assets: [] }) // '{\n  "permissions": [],\n  "bars": []\n}'` */
export function sheetManifestText(manifest: SheetTemplateManifestDto): string {
  const { permissions, bars, assets } = manifest;
  const shown = assets.length > 0 ? { permissions, bars, assets } : { permissions, bars };
  return JSON.stringify(shown, null, 2);
}

/** Reads what the master typed in the manifest tab; the refusal carries the contract's first
 *  issue, with where it is (`permissions.0: …`).
 *
 *  Example: `const reading = readSheetManifestText(draft.manifest); if (!reading.ok) show(reading.problem)` */
export function readSheetManifestText(text: string): SheetManifestReading {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, problem: { kind: 'not_json' } };
  }
  const parsed = sheetTemplateManifestDto.safeParse(value);
  if (parsed.success) return { ok: true, manifest: parsed.data };
  const issue = parsed.error.issues[0];
  const where = issue && issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
  return { ok: false, problem: { kind: 'invalid', detail: `${where}${issue?.message ?? ''}` } };
}
