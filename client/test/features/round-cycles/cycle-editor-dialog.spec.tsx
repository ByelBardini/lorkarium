import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CycleEditorDialog } from '@/features/round-cycles/cycle-editor-dialog';
import { NEW_CYCLE_DRAFT } from '@/lib/round-cycle-form';
import type { RoundCycleFields } from '@/services/round-cycle-commands';
import { AssetsApiFake } from '../../support/assets-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';

const images = { campaignId: VHARN.id, assets: new AssetsApiFake() };
const holders = [
  { key: 'table', label: 'A mesa (todo combate)' },
  { key: 'token:kraken', label: 'Kraken (token)' },
];

function renderEditor(onSave: (fields: RoundCycleFields) => Promise<boolean>): string[] {
  const closes: string[] = [];
  render(
    <CycleEditorDialog
      title="Novo ciclo"
      initial={NEW_CYCLE_DRAFT}
      holders={holders}
      players={[]}
      images={images}
      onSave={onSave}
      onClose={() => closes.push('closed')}
    />,
  );
  return closes;
}

async function fillTwoPhases(): Promise<void> {
  await userEvent.type(screen.getByLabelText('Nome'), 'Maré');
  await userEvent.type(screen.getByLabelText('Nome da fase 1'), 'Baixa');
  await userEvent.type(screen.getByLabelText('Nome da fase 2'), 'Alta');
}

describe('CycleEditorDialog', () => {
  it('a cycle of a loose token goes with its holder', async () => {
    const saved: RoundCycleFields[] = [];
    renderEditor(async (fields) => saved.push(fields) > 0);
    await fillTwoPhases();
    await userEvent.click(screen.getByRole('combobox', { name: 'Pertence a' }));
    await userEvent.click(screen.getByRole('option', { name: 'Kraken (token)' }));

    await userEvent.click(screen.getByRole('button', { name: 'Salvar ciclo' }));

    expect(saved[0]?.holder).toEqual({ kind: 'token', tokenId: 'kraken' });
  });

  it('a phase without a name says which one and saves nothing', async () => {
    const saved: RoundCycleFields[] = [];
    renderEditor(async (fields) => saved.push(fields) > 0);
    await userEvent.type(screen.getByLabelText('Nome'), 'Maré');
    await userEvent.type(screen.getByLabelText('Nome da fase 1'), 'Baixa');

    await userEvent.click(screen.getByRole('button', { name: 'Salvar ciclo' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Dê um nome à fase 2.');
    expect(saved).toEqual([]);
  });

  it('a refused save keeps it open; Cancelar closes it', async () => {
    const closes = renderEditor(async () => false);
    await fillTwoPhases();

    await userEvent.click(screen.getByRole('button', { name: 'Salvar ciclo' }));
    expect(closes).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(closes).toEqual(['closed']);
  });
});
