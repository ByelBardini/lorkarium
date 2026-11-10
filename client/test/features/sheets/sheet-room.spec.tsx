import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SheetHolderDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { useSheetRoom } from '@/features/sheets/sheet-room-context';
import {
  SHEET_ACTION_ID,
  TORMENTA_TEMPLATE_ID,
  lyraSheet,
  sheetResponse,
  sheetWrite,
  spareSummary,
} from '../../support/sheet-fixtures';
import { sheetRoom } from '../../support/sheet-room-harness';
import { BIA_AT_TABLE } from '../../support/table-session-fixtures';

const TO_BIA: SheetHolderDto = { memberId: BIA_AT_TABLE.userId };
const NOTICE = 'A ficha foi dada. Não couberam: ES (limite de 8 barras).';

// The master's two ways of giving a sheet in the room, as the menus call them.
function GiveButtons({ holder }: Readonly<{ holder: SheetHolderDto | null }>): React.JSX.Element {
  const room = useSheetRoom();
  const sheet = { templateId: TORMENTA_TEMPLATE_ID, name: 'Ficha Tormenta · Lyra' };
  return (
    <>
      <button onClick={() => room?.actions.give(spareSummary(), holder)}>Dar</button>
      <button onClick={() => room?.actions.create({ ...sheet, holder: TO_BIA })}>Criar</button>
    </>
  );
}

// The room's own status line (the tab strip under it has statuses of its own).
async function noticeLine(): Promise<HTMLElement | null> {
  const text = await screen.findByText(/^A ficha foi dada\./);
  return text.closest('[role="status"]');
}

function noNotice(): void {
  expect(screen.queryByText(/^A ficha foi dada\./)).not.toBeInTheDocument();
}

function givenAnswer(skippedBars: string[]) {
  const given = lyraSheet({ canManage: true });
  return { ok: true as const, value: sheetWrite(given, 'update', SHEET_ACTION_ID, skippedBars) };
}

describe('the room says which bars a given sheet could not add', () => {
  it('giving a spare sheet to Bia whose character is full shows the bars left out', async () => {
    const { deps, renderItems } = sheetRoom();
    deps.sheetsApi.updateResult = givenAnswer(['ES']);
    renderItems(<GiveButtons holder={TO_BIA} />);

    await userEvent.click(screen.getByRole('button', { name: 'Dar' }));

    expect(await noticeLine()).toHaveTextContent(NOTICE);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a new sheet for Bia opens and says the bars left out, in the template order', async () => {
    const { deps, renderItems } = sheetRoom();
    const created = lyraSheet({ name: 'Ficha Tormenta · Lyra', canManage: true });
    const write = sheetWrite(created, 'create', SHEET_ACTION_ID, ['MP', 'ES']);
    deps.sheetsApi.createResult = { ok: true, value: write };
    deps.sheetsApi.response = sheetResponse(created);
    renderItems(<GiveButtons holder={TO_BIA} />);

    await userEvent.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await noticeLine()).toHaveTextContent(
      'A ficha foi dada. Não couberam: MP, ES (limite de 8 barras).',
    );
    expect(await screen.findByRole('tab', { name: 'Ficha · Ficha Tormenta · Lyra' })).toBeVisible();
    act(() => deps.documentWorkspace.getState().clear());
  });

  it('every bar fitting says nothing', async () => {
    const { deps, renderItems } = sheetRoom();
    deps.sheetsApi.updateResult = givenAnswer([]);
    renderItems(<GiveButtons holder={TO_BIA} />);

    await userEvent.click(screen.getByRole('button', { name: 'Dar' }));

    await waitFor(() => expect(deps.sheetsApi.updates).toHaveLength(1));
    await act(() => Promise.resolve());
    noNotice();
  });

  it('"Entendi" puts the notice away', async () => {
    const { deps, renderItems } = sheetRoom();
    deps.sheetsApi.updateResult = givenAnswer(['ES']);
    renderItems(<GiveButtons holder={TO_BIA} />);
    await userEvent.click(screen.getByRole('button', { name: 'Dar' }));
    await noticeLine();

    await userEvent.click(screen.getByRole('button', { name: 'Entendi' }));

    noNotice();
  });

  it('a refused gift still says the refusal, not the bars', async () => {
    const { deps, renderItems } = sheetRoom();
    deps.sheetsApi.updateResult = { ok: false, failure: { kind: 'member_not_found' } };
    renderItems(<GiveButtons holder={TO_BIA} />);

    await userEvent.click(screen.getByRole('button', { name: 'Dar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esse jogador não está mais na mesa.',
    );
    noNotice();
  });
});
