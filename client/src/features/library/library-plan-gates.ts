import type { PlanLimits } from '@lorkarium/contracts';
import { createContext, useContext, useMemo } from 'react';
import { OPEN_GATE, countGate, featureGate, type PlanGate } from '@/features/plans/plan-gate';
import { usePlanLimits } from '@/features/plans/use-plan-limits';

/** What the table's plan still lets the master create in the library, counted on the library
 *  read (the server counts again and has the last word). */
export type LibraryPlanGates = Readonly<{
  grid: PlanGate;
  duplicate: PlanGate;
  map: PlanGate;
  sheetTemplate: PlanGate;
}>;

const ALL_OPEN: LibraryPlanGates = {
  grid: OPEN_GATE,
  duplicate: OPEN_GATE,
  map: OPEN_GATE,
  sheetTemplate: OPEN_GATE,
};

// Only the counts matter: the loaded library and its mixed view both fit.
type CountedLibrary = Readonly<{
  scenes: readonly unknown[];
  maps?: readonly unknown[] | undefined;
  sheetTemplates?: readonly unknown[] | undefined;
}>;

/** The gates of a library under `limits` (`null` = not known: all open). Duplicating needs the
 *  copy in the plan and room for one more grid.
 *
 *  Example: `libraryPlanGatesOf(PLAN_LIMITS.free, library).grid.open // false with 5 grids` */
export function libraryPlanGatesOf(
  limits: PlanLimits | null,
  library: CountedLibrary,
): LibraryPlanGates {
  const grid = countGate(limits, 'scenes', library.scenes.length);
  const copy = featureGate(limits, (offer) => offer.sceneCopy);
  return {
    grid,
    duplicate: copy.open ? grid : copy,
    map: countGate(limits, 'libraryMaps', library.maps?.length ?? 0),
    sheetTemplate: countGate(limits, 'sheetTemplates', library.sheetTemplates?.length ?? 0),
  };
}

/** Given by the `LibraryBrowser`; all open outside a library. */
export const LibraryPlanGatesContext = createContext<LibraryPlanGates>(ALL_OPEN);

/** The gates of `library` by the table's limits around, the same object while both stay.
 *
 *  Example: `<LibraryPlanGatesContext value={useLibraryPlanGatesOf(library)}>…</LibraryPlanGatesContext>` */
export function useLibraryPlanGatesOf(library: CountedLibrary): LibraryPlanGates {
  const { table } = usePlanLimits();
  return useMemo(() => libraryPlanGatesOf(table, library), [table, library]);
}

/** The library's gates around this component (all open outside a library).
 *
 *  Example: `const { duplicate } = useLibraryPlanGates()` */
export function useLibraryPlanGates(): LibraryPlanGates {
  return useContext(LibraryPlanGatesContext);
}
