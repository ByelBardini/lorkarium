import { useEffect } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { DICE_PLAIN_ROLL_CUE, diceRollCuesOf, type DiceRollCue } from '@/dice-audio/dice-roll-cues';
import type { DiceSound, DiceSoundFactory } from '@/dice-audio/dice-sound';
import type { DiceHistoryEntry, DiceHistoryStore } from '@/stores/dice-history-store';
import type { DicePreferencesStore } from '@/stores/dice-preferences-store';
import { useOpenTables, type OpenTablesStore } from '@/stores/open-tables-store';

export type DiceSoundDeps = Readonly<{
  campaignId: string;
  openTables: StoreApi<OpenTablesStore>;
  /** "Som dos dados" on this device. */
  dicePreferences: StoreApi<DicePreferencesStore>;
  createDiceSound: DiceSoundFactory;
}>;

/** What a new entry sounds like: one roll per wave of its throw, or one plain roll when there is
 *  no throw to follow (a secret notice, a roll of only d7…).
 *
 *  Example: `sound.play(rollCuesOfEntry(entry))` */
export function rollCuesOfEntry(entry: DiceHistoryEntry): DiceRollCue[] {
  if (entry.kind === 'rolled' && entry.event.throw !== null) {
    return diceRollCuesOf(entry.event.throw);
  }
  return [DICE_PLAIN_ROLL_CUE];
}

/** Plays a roll sound for each new roll of the open table, its first hit on the dice landing in
 *  the 3D throw (both start when the event arrives), whether or not "Dados 3D" is on. The sound
 *  is prepared on entering the room (or on unmuting), so the first roll is heard too. Muting
 *  stops what is still sounding; leaving the room destroys the sound.
 *
 *  Example: `useDiceSound({ campaignId: campaign.id, openTables, dicePreferences, createDiceSound })` */
export function useDiceSound(deps: DiceSoundDeps): void {
  const { campaignId, openTables, dicePreferences, createDiceSound } = deps;
  const history = useOpenTables(
    openTables,
    (state) => state.tables.find((table) => table.campaignId === campaignId)?.dice ?? null,
  );
  useEffect(() => {
    if (history === null) return;
    return soundOn(history, dicePreferences, createDiceSound());
  }, [history, dicePreferences, createDiceSound]);
}

function soundOn(
  history: StoreApi<DiceHistoryStore>,
  preferences: StoreApi<DicePreferencesStore>,
  sound: DiceSound,
): () => void {
  if (preferences.getState().sound) sound.prepare();
  const stopHearing = history.getState().onNewEntry((entry) => {
    if (preferences.getState().sound) sound.play(rollCuesOfEntry(entry));
  });
  const stopWatching = preferences.subscribe((state, previous) => {
    if (previous.sound && !state.sound) sound.stop();
    if (!previous.sound && state.sound) sound.prepare();
  });
  return () => {
    stopHearing();
    stopWatching();
    sound.destroy();
  };
}
