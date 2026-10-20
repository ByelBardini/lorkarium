import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TokenPreview } from '@/features/tokens/token-preview';
import { addBar } from '@/features/tokens/bar-form-state';
import {
  emptyTokenForm,
  renameToken,
  type TokenFormValues,
} from '@/features/tokens/token-form-state';
import { AssetsApiFake } from '../../support/assets-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';

const METERS = { cellDistance: 1.5, cellUnit: 'm' };

function renderPreview(form: TokenFormValues): void {
  render(
    <TokenPreview
      form={form}
      image={{ campaignId: VHARN.id, assets: new AssetsApiFake() }}
      onImage={() => undefined}
      distance={METERS}
    />,
  );
}

function renderPreviewWith(form: TokenFormValues): { container: HTMLElement } {
  return render(
    <TokenPreview
      form={form}
      image={{ campaignId: VHARN.id, assets: new AssetsApiFake() }}
      onImage={() => undefined}
      distance={METERS}
    />,
  );
}

function discOf(): HTMLElement {
  const disc = screen.getByRole('group', { name: 'Imagem do token' }).lastElementChild;
  if (!(disc instanceof HTMLElement)) throw new Error('the preview has no disc');
  return disc;
}

describe('TokenPreview', () => {
  it('an enemy is ringed in the enemy tone', () => {
    renderPreview({ ...renameToken(emptyTokenForm(METERS), 'Ogro'), side: 'enemy' });

    expect(screen.getByText('OG').parentElement?.style.boxShadow).toContain('var(--chart-3)');
  });

  it('the disc is 52 px per cell, and stops growing at 216 px', () => {
    renderPreview({ ...emptyTokenForm(METERS), width: 2, height: 1 });
    expect(discOf().style.width).toBe('104px');
    expect(discOf().style.height).toBe('52px');
  });

  it('a 10 × 10 token stops at 216 px', () => {
    renderPreview({ ...emptyTokenForm(METERS), width: 10, height: 10 });

    expect(discOf().style.width).toBe('216px');
  });

  it('the first bar is drawn under the disc; without bars, none', () => {
    renderPreview({ ...emptyTokenForm(METERS), bars: addBar([]) });

    expect(discOf().querySelector('.rounded-full.bg-divider')).toBeInTheDocument();
  });

  it('a torch of 4 + 4 cells glows past the stage, held at 560 px', () => {
    const { container } = renderPreviewWith({
      ...emptyTokenForm(METERS),
      light: { on: true, bright: '6', dim: '12', saved: false },
    });

    expect(container.querySelector<HTMLElement>('[data-light-glow]')?.style.width).toBe('560px');
  });

  it('a light of 1 + 1 cells glows 2 × 2 × 52 + 52 = 260 px wide', () => {
    const { container } = renderPreviewWith({
      ...emptyTokenForm(METERS),
      light: { on: true, bright: '1,5', dim: '3', saved: false },
    });

    expect(container.querySelector<HTMLElement>('[data-light-glow]')?.style.width).toBe('260px');
  });

  it('without light, nothing glows', () => {
    const { container } = renderPreviewWith(emptyTokenForm(METERS));

    expect(container.querySelector('[data-light-glow]')).toBeNull();
  });

  it('dragging a file over the preview reads "Solta aqui", and leaving takes it away', () => {
    renderPreview(emptyTokenForm(METERS));
    const stage = screen.getByRole('group', { name: 'Imagem do token' });

    fireEvent.dragOver(stage);
    expect(screen.getByText('Solta aqui')).toBeInTheDocument();
    fireEvent.dragLeave(stage);

    expect(screen.queryByText('Solta aqui')).not.toBeInTheDocument();
  });

  it('under the name come "Escolher imagem" and the link button, which opens the field there', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    renderPreview(emptyTokenForm(METERS));

    await userEvent.click(screen.getByRole('button', { name: 'Usar link de imagem' }));

    expect(screen.getByRole('button', { name: 'Escolher imagem' })).toBeInTheDocument();
    expect(screen.getByLabelText('Link da imagem')).toHaveFocus();
  });
});
