/** A bar as the resolution needs it (a `TokenBarDto` fits). */
export type SheetBarRef = Readonly<{ id: string; label: string }>;

export type SheetBarResolution =
  | Readonly<{ ok: true; barId: string }>
  | Readonly<{ ok: false; code: 'NO_TOKEN' | 'BAR_NOT_FOUND' | 'BAR_AMBIGUOUS'; message: string }>;

/** The label as the author would type it: no case, accents or edge spaces ("Vida " = "vida").
 *
 *  Example: `sheetBarLabelKey(' Pontos de Ação ') // 'pontos de acao'` */
export function sheetBarLabelKey(label: string): string {
  return label.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
}

/** Turns the frame's `bars.adjust` reference into the id of one of the token's bars: the exact
 *  id first, else the only bar whose label matches (by `sheetBarLabelKey`). `bars` is `null` when
 *  the sheet has no token.
 *
 *  Example: `resolveSheetBar(token.bars, 'pv') // { ok: true, barId: '…' }` */
export function resolveSheetBar(
  bars: readonly SheetBarRef[] | null,
  reference: string,
): SheetBarResolution {
  if (bars === null) return refused('NO_TOKEN', `bar "${reference}": this sheet has no token`);
  const exact = bars.find((bar) => bar.id === reference);
  if (exact !== undefined) return { ok: true, barId: exact.id };
  const key = sheetBarLabelKey(reference);
  const named = bars.filter((bar) => sheetBarLabelKey(bar.label) === key);
  if (named.length === 1) return { ok: true, barId: (named[0] as SheetBarRef).id };
  if (named.length === 0) return refused('BAR_NOT_FOUND', notFoundMessage(bars, reference));
  return refused(
    'BAR_AMBIGUOUS',
    `bar "${reference}" matches ${named.length} bars; expected one: use the bar's id`,
  );
}

function notFoundMessage(bars: readonly SheetBarRef[], reference: string): string {
  const labels = bars.map((bar) => `"${bar.label}"`).join(', ') || 'none';
  return `bar "${reference}" not found; expected the id or the label of one of: ${labels}`;
}

type SheetBarRefusalCode = Extract<SheetBarResolution, { ok: false }>['code'];

function refused(code: SheetBarRefusalCode, message: string): SheetBarResolution {
  return { ok: false, code, message };
}
