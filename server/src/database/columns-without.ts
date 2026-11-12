/** The columns of a table without the heavy ones, for a select that must not read them (a
 *  silhouette, the values of a sheet).
 *
 *  Example: `db.select(columnsWithout(getTableColumns(tokenSheets), 'values')).from(tokenSheets)` */
export function columnsWithout<C extends object, K extends keyof C>(
  columns: C,
  ...left: readonly K[]
): Omit<C, K> {
  const kept = Object.entries(columns).filter(([name]) => !left.some((key) => key === name));
  return Object.fromEntries(kept) as Omit<C, K>;
}
