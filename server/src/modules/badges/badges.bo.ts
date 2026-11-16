/** A catalog badge as the grant rule sees it. */
export type CatalogEntry = Readonly<{ id: string; hasImage: boolean }>;

export type OrderVerdict =
  | Readonly<{ kind: 'current' }>
  | Readonly<{ kind: 'stale'; missing: readonly string[]; extra: readonly string[] }>;

export type GrantVerdict =
  | Readonly<{ kind: 'grantable' }>
  | Readonly<{ kind: 'unknown'; badgeId: string }>
  | Readonly<{ kind: 'without-image'; badgeId: string }>;

/** A new order is accepted only as a permutation of the catalog as it is now: one created or
 *  deleted meanwhile makes the list the admin sent stale (the screen reads it again).
 *  The ids come unique (the DTO refuses repeats).
 *
 *  Example: `orderVerdict([a, b], [b, a]) // { kind: 'current' }` */
export function orderVerdict(
  catalogIds: readonly string[],
  askedIds: readonly string[],
): OrderVerdict {
  const asked = new Set(askedIds);
  const catalog = new Set(catalogIds);
  const missing = catalogIds.filter((id) => !asked.has(id));
  const extra = askedIds.filter((id) => !catalog.has(id));
  if (missing.length === 0 && extra.length === 0) return { kind: 'current' };
  return { kind: 'stale', missing, extra };
}

/** Only catalog badges with an image can be granted: one without would never show on a card.
 *  An unknown id is told first (someone deleted it while the dialog was open).
 *
 *  Example: `grantVerdict(catalog, [veteranoId]) // { kind: 'grantable' }` */
export function grantVerdict(
  catalog: readonly CatalogEntry[],
  askedIds: readonly string[],
): GrantVerdict {
  const byId = new Map(catalog.map((entry) => [entry.id, entry]));
  const unknown = askedIds.find((id) => !byId.has(id));
  if (unknown !== undefined) return { kind: 'unknown', badgeId: unknown };
  const withoutImage = askedIds.find((id) => byId.get(id)?.hasImage === false);
  if (withoutImage !== undefined) return { kind: 'without-image', badgeId: withoutImage };
  return { kind: 'grantable' };
}
