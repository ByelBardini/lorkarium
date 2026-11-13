import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CharacterDto } from '@lorkarium/contracts';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { RoomName } from '@/features/maps/room-name';
import { useViewerMainSheet } from '@/features/sheets/use-viewer-main-sheet';
import { ANA } from '../../support/auth-api-fake';
import { detailOf, VHARN } from '../../support/campaigns-api-fake';
import {
  charactersSynced,
  kaelCharacter,
  LYRA_CHARACTER_ID,
  lyraCharacter,
} from '../../support/character-fixtures';
import { GOBLIN_SHEET_ID, lyraSummary } from '../../support/sheet-fixtures';
import { serverSheetIs, sheetRoom } from '../../support/sheet-room-harness';

const SPELLS = lyraSummary({ id: GOBLIN_SHEET_ID, name: 'Magias de Lyra' });
const BUTTON = 'Abrir a ficha de Lyra';

// The top bar's wiring: the title with the viewer's main sheet beside the table's name.
function TitleOf({ viewerId }: Readonly<{ viewerId: string | null }>) {
  const mainSheet = useViewerMainSheet(viewerId);
  // RoomName links back to "Suas mesas", so it needs a router.
  return (
    <MemoryRouter>
      <RoomName
        campaign={detailOf(VHARN)}
        tabs={null}
        workspace={undefined}
        mainSheet={mainSheet}
      />
    </MemoryRouter>
  );
}

function anaPlays(...characters: CharacterDto[]) {
  const room = sheetRoom();
  room.table.characters.getState().apply(charactersSynced(3, ...characters));
  return room;
}

describe('the main sheet button of the top bar', () => {
  let clear: (() => void) | null = null;
  afterEach(() => act(() => clear?.()));

  it("opens the viewer's main sheet, and lights up while it is shown", async () => {
    const { deps, renderItems } = anaPlays(
      lyraCharacter({ userId: ANA.id, mainSheetId: SPELLS.id }),
    );
    clear = () => deps.documentWorkspace.getState().clear();
    deps.sheetsApi.sheetsOfCharacter[LYRA_CHARACTER_ID] = [lyraSummary(), SPELLS];
    serverSheetIs(deps, SPELLS);
    renderItems(<TitleOf viewerId={ANA.id} />);
    const button = await screen.findByRole('button', { name: BUTTON });
    expect(button).toHaveAttribute('aria-keyshortcuts', 'Shift+F');
    expect(button).not.toHaveAttribute('aria-current');
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-current', 'page');
    expect(Object.values(deps.documentWorkspace.getState().activeByCampaign)).toContain(
      `${VHARN.id}:sheet:${SPELLS.id}`,
    );
  });

  it('Shift+F opens it from anywhere on the page', async () => {
    const { deps, renderItems } = anaPlays(lyraCharacter({ userId: ANA.id }));
    clear = () => deps.documentWorkspace.getState().clear();
    deps.sheetsApi.sheetsOfCharacter[LYRA_CHARACTER_ID] = [lyraSummary()];
    renderItems(<TitleOf viewerId={ANA.id} />);
    const button = await screen.findByRole('button', { name: BUTTON });
    fireEvent.keyDown(document.body, { key: 'F', shiftKey: true });
    expect(button).toHaveAttribute('aria-current', 'page');
  });

  it("is not there for someone else's character, nor with no sheet the viewer may read", async () => {
    const { deps, renderItems } = anaPlays(lyraCharacter(), kaelCharacter({ userId: ANA.id }));
    deps.sheetsApi.sheetsOfCharacter[LYRA_CHARACTER_ID] = [lyraSummary()];
    renderItems(<TitleOf viewerId={ANA.id} />);
    await waitFor(() => expect(deps.sheetsApi.ofCharacterCalls).toHaveLength(1));
    await act(() => Promise.resolve());
    expect(screen.queryByRole('button', { name: /Abrir a ficha/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: VHARN.name })).toBeInTheDocument();
  });

  it('with several sheets and no main chosen, there is no button', async () => {
    const { deps, renderItems } = anaPlays(lyraCharacter({ userId: ANA.id }));
    deps.sheetsApi.sheetsOfCharacter[LYRA_CHARACTER_ID] = [lyraSummary(), SPELLS];
    renderItems(<TitleOf viewerId={ANA.id} />);
    await waitFor(() => expect(deps.sheetsApi.ofCharacterCalls).toHaveLength(1));
    await act(() => Promise.resolve());
    expect(screen.queryByRole('button', { name: BUTTON })).not.toBeInTheDocument();
  });

  it('signed out (no viewer), nothing is read', async () => {
    const { deps, renderItems } = anaPlays(lyraCharacter({ userId: ANA.id }));
    renderItems(<TitleOf viewerId={null} />);
    await act(() => Promise.resolve());
    expect(deps.sheetsApi.ofCharacterCalls).toEqual([]);
  });
});
