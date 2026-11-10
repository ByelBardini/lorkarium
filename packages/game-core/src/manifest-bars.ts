/** A bar's label as people compare it: no case, accents or edge spaces ("Vida " = "vida").
 *
 *  Example: `barLabelKey(' Pontos de Ação ') // 'pontos de acao'` */
export function barLabelKey(label: string): string {
  return label.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
}

type Labelled = Readonly<{ label: string }>;

export type ManifestBarsPlan<T extends Labelled> = Readonly<{
  added: T[];
  skipped: string[];
}>;

/** The manifest bars a holder lacks (by `barLabelKey`), in manifest order, up to `cap` bars in
 *  all; the missing ones past the cap come back in `skipped` by label. Existing bars are never
 *  touched.
 *
 *  Example: `missingManifestBars([{ label: 'HP' }], manifest, 8) // { added: [MP, EF], skipped: [] }` */
export function missingManifestBars<T extends Labelled>(
  existing: readonly Labelled[],
  manifest: readonly T[],
  cap: number,
): ManifestBarsPlan<T> {
  requireCap(cap);
  const taken = new Set(existing.map((bar) => barLabelKey(bar.label)));
  const room = Math.max(cap - existing.length, 0);
  const added: T[] = [];
  const skipped: string[] = [];
  for (const bar of manifest) {
    const key = barLabelKey(bar.label);
    if (taken.has(key)) continue;
    taken.add(key);
    if (added.length < room) added.push(bar);
    else skipped.push(bar.label);
  }
  return { added, skipped };
}

function requireCap(cap: number): void {
  if (Number.isInteger(cap) && cap >= 1) return;
  throw new RangeError(`Bar cap ${String(cap)} is invalid: expected a whole number of at least 1.`);
}
