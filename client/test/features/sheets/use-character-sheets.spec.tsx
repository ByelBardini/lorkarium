import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CardPortrait } from '@/features/sessions/player-card-parts';
import {
  mainSheetOf,
  mainSheetOpener,
  useCharacterSheets,
} from '@/features/sheets/use-character-sheets';
import { LYRA_CHARACTER_ID, linkedLyra } from '../../support/character-fixtures';
import { BIA_ONLINE } from '../../support/player-card-harness';
import { GOBLIN_SHEET_ID, lyraSummary } from '../../support/sheet-fixtures';
import { serverSheetIs, sheetRoom } from '../../support/sheet-room-harness';

const SPELLS = lyraSummary({ id: GOBLIN_SHEET_ID, name: 'Magias de Lyra' });

// The card's wiring: the portrait of Lyra opens her main sheet on a double click.
function LyraPortrait({ mainSheetId }: Readonly<{ mainSheetId: string | null }>) {
  const found = useCharacterSheets(LYRA_CHARACTER_ID);
  return (
    <CardPortrait
      face={linkedLyra()}
      member={BIA_ONLINE}
      name="Lyra"
      onGrid={false}
      onOpenSheet={mainSheetOpener(found, mainSheetId)}
    />
  );
}

describe('mainSheetOf', () => {
  it('answers the main sheet among several', () => {
    expect(mainSheetOf([lyraSummary(), SPELLS], SPELLS.id)).toBe(SPELLS);
  });

  it('with no main chosen, the only sheet stands in; with several, none does', () => {
    const lyra = lyraSummary();
    expect(mainSheetOf([lyra], null)).toBe(lyra);
    expect(mainSheetOf([lyra, SPELLS], null)).toBeUndefined();
  });

  it('a main sheet the reader may not read is not answered', () => {
    expect(mainSheetOf([lyraSummary(), SPELLS], 'ffffffff-ffff-4fff-8fff-ffffffffffff')).toBe(
      undefined,
    );
  });
});

describe('double click on the portrait', () => {
  it('opens the main sheet of a character with several', async () => {
    const { deps, renderItems } = sheetRoom();
    deps.sheetsApi.sheetsOfCharacter[LYRA_CHARACTER_ID] = [lyraSummary(), SPELLS];
    serverSheetIs(deps, SPELLS);
    renderItems(<LyraPortrait mainSheetId={SPELLS.id} />);
    const portrait = screen.getByTestId('portrait');
    await waitFor(() =>
      expect(portrait).toHaveAttribute('title', 'Duplo clique abre a ficha de Lyra'),
    );
    await userEvent.dblClick(portrait);
    expect(await screen.findByRole('tab', { name: 'Ficha · Magias de Lyra' })).toBeInTheDocument();
    act(() => deps.documentWorkspace.getState().clear());
  });

  it('does nothing with several sheets and no main one', async () => {
    const { deps, renderItems } = sheetRoom();
    deps.sheetsApi.sheetsOfCharacter[LYRA_CHARACTER_ID] = [lyraSummary(), SPELLS];
    renderItems(<LyraPortrait mainSheetId={null} />);
    await waitFor(() => expect(deps.sheetsApi.ofCharacterCalls).toHaveLength(1));
    await act(() => Promise.resolve());
    const portrait = screen.getByTestId('portrait');
    await userEvent.dblClick(portrait);
    expect(portrait).not.toHaveAttribute('title');
    expect(screen.queryByRole('tab', { name: /^Ficha · / })).not.toBeInTheDocument();
  });
});
