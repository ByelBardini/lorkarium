import type { SheetBridgeResultValueDto } from '@lorkarium/contracts';
import { admitInWindow, type RateWindowRule } from '@/lib/rate-window';

/** How the host answers one frame request: `result` (with what it returns, if anything) or
 *  `error` with a code in UPPER_SNAKE. */
export type SheetBridgeAnswer =
  | Readonly<{ ok: true; value?: SheetBridgeResultValueDto }>
  | Readonly<{ ok: false; code: string; message: string }>;

export const SHEET_BRIDGE_DONE: SheetBridgeAnswer = { ok: true };

/** Example: `return refusedWith('NO_CHARACTER', 'character.set refused: …')` */
export function refusedWith(code: string, message: string): SheetBridgeAnswer {
  return { ok: false, code, message };
}

/** A failure `kind` of a service (`too_large`) as the frame's code (`TOO_LARGE`).
 *
 *  Example: `refusedByKind('assets.upload', 'too_large')` */
export function refusedByKind(request: string, kind: string): SheetBridgeAnswer {
  const code = kind.toUpperCase();
  return refusedWith(code, `${request} refused with ${code}`);
}

/** The moments admitted by one rate window, kept by the host between requests. */
export type SheetRateStamps = { stamps: readonly number[] };

/** Admits one more request in `rule` at `nowMs`, keeping the stamps; a refusal does not count.
 *
 *  Example: `if (!admitted(bridge.uploads, clock.now(), SHEET_UPLOAD_RATE)) return refusedWith('RATE_LIMITED', …)` */
export function admitted(slot: SheetRateStamps, nowMs: number, rule: RateWindowRule): boolean {
  const admission = admitInWindow(slot.stamps, nowMs, rule);
  slot.stamps = admission.stamps;
  return admission.admitted;
}
