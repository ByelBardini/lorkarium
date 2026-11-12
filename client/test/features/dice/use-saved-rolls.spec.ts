import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSavedRolls } from '@/features/dice/use-saved-rolls';
import { VHARN } from '../../support/campaigns-api-fake';
import { ACERTO } from '../../support/dice-fixtures';
import { SavedRollsApiFake } from '../../support/saved-rolls-api-fake';

const ATAQUE = { name: 'Ataque', parts: [{ label: null, expression: '1d20+5' }] };

describe('useSavedRolls', () => {
  // Regression: with the chat drawer open beside the "Dados" tab, "/ataque" saved in the tab was
  // an unknown command in the composer until the drawer remounted (2026-11-12).
  it('a roll saved by the dice tab is at once in the list the chat composer reads', async () => {
    const api = new SavedRollsApiFake();
    api.rolls.set(VHARN.id, [ACERTO]);
    const diceTab = renderHook(() => useSavedRolls(VHARN.id, api));
    const composer = renderHook(() => useSavedRolls(VHARN.id, api));
    await waitFor(() => expect(composer.result.current.rolls).toEqual([ACERTO]));

    await act(() => diceTab.result.current.create(ATAQUE));

    expect(composer.result.current.rolls?.map((roll) => roll.name)).toEqual(['Acerto', 'Ataque']);
  });

  it('mounting again lists again, showing the last list meanwhile', async () => {
    const api = new SavedRollsApiFake();
    api.rolls.set(VHARN.id, [ACERTO]);
    const first = renderHook(() => useSavedRolls(VHARN.id, api));
    await waitFor(() => expect(first.result.current.rolls).toEqual([ACERTO]));
    first.unmount();

    const again = renderHook(() => useSavedRolls(VHARN.id, api));

    expect(again.result.current.rolls).toEqual([ACERTO]);
    await waitFor(() => expect(api.answers.callsOf('list')).toHaveLength(2));
  });
});
