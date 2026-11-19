import type { PlanLimits } from '@lorkarium/contracts';
import { featureGate } from '@/features/plans/plan-gate';
import { usePlanLimits } from '@/features/plans/use-plan-limits';
import { PLAN_NAMES } from '@/lib/plan-seal';
import { hasAuthorScripts, type SheetSource } from '@/sheet-sandbox/sheet-srcdoc';

/** Why the template's JS does not run on this table, or `null` when it runs (or the limits are
 *  not known). The table's plan decides: the frame is built without the JS and the console says it.
 *
 *  Example: `sheetScriptsNotice(PLAN_LIMITS.free) // 'Os scripts deste modelo não rodam no plano Grátis. Disponível no plano Narrador'` */
export function sheetScriptsNotice(limits: PlanLimits | null): string | null {
  const gate = featureGate(limits, (offer) => offer.sheetScripts);
  if (gate.open || limits === null) return null;
  return `Os scripts deste modelo não rodam no plano ${PLAN_NAMES[limits.plan]}. ${gate.hint}`;
}

/** The notice of the table around this component for `source`: `undefined` when its JS runs, or
 *  when it has no JS to leave out (nothing to say). The frame runs the JS exactly when it is
 *  `undefined`.
 *
 *  Example: `const notice = useSheetScriptsNotice(template); <SheetSourceFrame scripts={notice === undefined} … />` */
export function useSheetScriptsNotice(source: SheetSource | null): string | undefined {
  const notice = sheetScriptsNotice(usePlanLimits().table);
  if (notice === null || source === null || !hasAuthorScripts(source)) return undefined;
  return notice;
}
