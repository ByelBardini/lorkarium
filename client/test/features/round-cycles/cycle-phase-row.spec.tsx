import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CyclePhaseRow } from '@/features/round-cycles/cycle-phase-row';
import { OPEN_GATE } from '@/features/plans/plan-gate';
import { AssetsApiFake } from '../../support/assets-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';

const phase = {
  key: 'p-1',
  name: 'Lua Nova',
  icon: 'game-icons:cycle' as const,
  imageAssetId: null,
};
const images = { campaignId: VHARN.id, assets: new AssetsApiFake() };
const CLOSED = { open: false, hint: 'Disponível no plano Narrador' } as const;

describe('CyclePhaseRow', () => {
  it('the first of four moves down but not up, and reports the move', async () => {
    const moves: number[] = [];
    render(
      <ol>
        <CyclePhaseRow
          phase={phase}
          place={1}
          count={4}
          canRemove
          images={images}
          imageGate={OPEN_GATE}
          onChange={() => undefined}
          onMove={(by) => moves.push(by)}
          onRemove={() => undefined}
        />
      </ol>,
    );
    expect(screen.getByRole('button', { name: 'Subir a fase 1' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Descer a fase 1' }));
    expect(moves).toEqual([1]);
  });

  it('without room to lose a phase the remove button is off, and the image is a button', () => {
    render(
      <ol>
        <CyclePhaseRow
          phase={phase}
          place={2}
          count={2}
          canRemove={false}
          images={images}
          imageGate={OPEN_GATE}
          onChange={() => undefined}
          onMove={() => undefined}
          onRemove={() => undefined}
        />
      </ol>,
    );
    expect(screen.getByRole('button', { name: 'Tirar a fase 2' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Imagem ou GIF da fase 2' })).toBeInTheDocument();
  });

  it('a file chosen on the image square goes as a round_cycle_phase and becomes the phase image', async () => {
    const assets = new AssetsApiFake();
    const changes: unknown[] = [];
    const { container } = render(
      <ol>
        <CyclePhaseRow
          phase={phase}
          place={1}
          count={2}
          canRemove={false}
          images={{ campaignId: VHARN.id, assets }}
          imageGate={OPEN_GATE}
          onChange={(change) => changes.push(change)}
          onMove={() => undefined}
          onRemove={() => undefined}
        />
      </ol>,
    );
    const input = container.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('expected the file input');

    await userEvent.upload(input, new File(['png'], 'lua.png', { type: 'image/png' }));

    expect(assets.sent[0]).toMatchObject({ kind: 'upload', purpose: 'round_cycle_phase' });
    expect(changes).toEqual([{ imageAssetId: expect.any(String) }]);
  });

  it('without own images in the plan there is no image square, only the icon of the phase', () => {
    render(
      <ol>
        <CyclePhaseRow
          phase={phase}
          place={1}
          count={2}
          canRemove={false}
          images={images}
          imageGate={CLOSED}
          onChange={() => undefined}
          onMove={() => undefined}
          onRemove={() => undefined}
        />
      </ol>,
    );
    expect(screen.queryByRole('button', { name: 'Imagem ou GIF da fase 1' })).toBeNull();
    expect(screen.getByRole('button', { name: /^Ícone:/ })).toBeInTheDocument();
  });

  it('without own images in the plan, an image a phase kept stays, cannot be swapped, and goes', async () => {
    const changes: unknown[] = [];
    render(
      <ol>
        <CyclePhaseRow
          phase={{ ...phase, imageAssetId: 'img-lua' }}
          place={1}
          count={2}
          canRemove={false}
          images={images}
          imageGate={CLOSED}
          onChange={(change) => changes.push(change)}
          onMove={() => undefined}
          onRemove={() => undefined}
        />
      </ol>,
    );
    expect(screen.getByRole('button', { name: 'Imagem ou GIF da fase 1' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Tirar a imagem da fase 1' }));
    expect(changes).toEqual([{ imageAssetId: null }]);
  });
});
