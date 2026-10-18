import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { TokenImageDialog } from '@/features/tokens/token-image-dialog';
import { AssetsApiFake, LYRA_PORTRAIT } from '../../support/assets-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import { LYRA_ID, lyra } from '../../support/table-session-fixtures';

describe('TokenImageDialog', () => {
  let commands: TableBoardCommandsFake;
  let closed: number;

  beforeEach(() => {
    commands = new TableBoardCommandsFake();
    closed = 0;
  });

  function renderDialog(imageAssetId: string | null = null): void {
    render(
      <TokenImageDialog
        campaignId={VHARN.id}
        token={lyra({ imageAssetId })}
        commands={commands}
        assets={new AssetsApiFake()}
        onClose={() => {
          closed += 1;
        }}
      />,
    );
  }

  it('"Imagem de Lyra": a chosen image and "Salvar" restyle Lyra with it and close', async () => {
    renderDialog();
    expect(screen.getByRole('dialog', { name: 'Imagem de Lyra' })).not.toBeNull();
    const file = new File([new Uint8Array(4)], 'lyra.png', { type: 'image/png' });

    await userEvent.upload(screen.getByLabelText('Arquivo de imagem'), file);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(commands.sentAs('restyleTokens').map(({ fields }) => fields)).toEqual([
      { tokenIds: [LYRA_ID], style: { imageAssetId: LYRA_PORTRAIT.id } },
    ]);
    expect(closed).toBe(1);
  });

  it('"Remover imagem" and "Salvar" take the image away', async () => {
    renderDialog(LYRA_PORTRAIT.id);

    await userEvent.click(screen.getByRole('button', { name: 'Remover imagem' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(commands.sentAs('restyleTokens')[0]?.fields).toEqual({
      tokenIds: [LYRA_ID],
      style: { imageAssetId: null },
    });
  });

  it('a refusal shows in an alert and keeps the dialog open', async () => {
    commands.answerWith({ ok: false, failure: 'asset_not_found' });
    renderDialog(LYRA_PORTRAIT.id);

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Essa imagem não está mais na mesa.',
    );
    expect(closed).toBe(0);
  });
});
