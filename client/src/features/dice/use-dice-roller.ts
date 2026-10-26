import { useState } from 'react';
import { rollAspectOf } from '@/lib/dice-tray';
import type { DiceCommands, DiceRollRequest } from '@/services/dice-commands';
import { rollFailureMessage } from './dice-messages';

/** A roll as the screen asks for it; the physics box's aspect is this window's. */
export type DiceRollAsk = Omit<DiceRollRequest, 'aspect'>;

export type DiceRoller = Readonly<{
  /** Sends the roll; answers whether the server took it. */
  roll: (ask: DiceRollAsk) => Promise<boolean>;
  busy: boolean;
  /** The last refusal in pt-BR, cleared by the next roll. */
  problem: string | null;
}>;

/** Sends the rolls of one table (tray, saved roll, "Rolar de novo") and keeps the last refusal.
 *  The result is not here: it arrives to everyone as `dice:rolled`.
 *
 *  Example: `const roller = useDiceRoller(campaignId, deps.dice); await roller.roll({ label: null, parts, visibility: 'public' })` */
export function useDiceRoller(campaignId: string, dice: DiceCommands): DiceRoller {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const roll = async (ask: DiceRollAsk): Promise<boolean> => {
    setBusy(true);
    setProblem(null);
    const aspect = rollAspectOf({ width: window.innerWidth, height: window.innerHeight });
    const result = await dice.roll(campaignId, { ...ask, aspect });
    setBusy(false);
    if (!result.ok) setProblem(rollFailureMessage(result.failure));
    return result.ok;
  };
  return { roll, busy, problem };
}
