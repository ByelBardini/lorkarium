import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TokenPreview } from '@/features/tokens/token-preview';
import { addBar } from '@/features/tokens/bar-form-state';
import {
  emptyTokenForm,
  renameToken,
  tokenFormOf,
  type TokenFormValues,
} from '@/features/tokens/token-form-state';
import { fireAura, goldAura, RUNE_ASSET_ID, runeAura } from '../../support/aura-fixtures';
import { lyra } from '../../support/table-session-fixtures';
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

  it('an infernal light glows in its tone, #ff3b3b', () => {
    const { container } = renderPreviewWith({
      ...emptyTokenForm(METERS),
      light: { on: true, bright: '6', dim: '12', saved: false },
      lightColor: 'infernal',
    });

    const glow = container.querySelector<HTMLElement>('[data-light-glow]');
    expect(glow?.style.background).toContain('rgba(255, 59, 59, 0.22)');
  });

  it('a neutral light glows in the gold of today', () => {
    const { container } = renderPreviewWith({
      ...emptyTokenForm(METERS),
      light: { on: true, bright: '6', dim: '12', saved: false },
    });

    const glow = container.querySelector<HTMLElement>('[data-light-glow]');
    expect(glow?.style.background).toContain('rgba(226, 199, 147, 0.22)');
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

describe('TokenPreview, a lantern', () => {
  function litForm(lightAngle: string, facing: number): TokenFormValues {
    const form = emptyTokenForm(METERS);
    return {
      ...form,
      facing,
      lightAngle,
      light: { on: true, bright: '6', dim: '12', saved: false },
    };
  }

  function glow(container: HTMLElement): HTMLElement | null {
    return container.querySelector('[data-light-glow]');
  }

  // CSS conic gradients start at the top: facing 90 (down) is 180deg, so 60° opens from 150deg.
  it('a beam of 60° looking down (90) is a wedge masked from 150deg', () => {
    const { container } = renderPreviewWith(litForm('60', 90));

    expect(glow(container)?.style.maskImage).toContain('conic-gradient(from 150deg');
  });

  it('a beam of 360° is the round glow, without a mask', () => {
    const { container } = renderPreviewWith(litForm('360', 90));

    expect(glow(container)?.style.maskImage).toBe('');
  });
});

describe('TokenPreview, the aura', () => {
  function auraGlow(container: HTMLElement): HTMLElement | null {
    return container.querySelector<HTMLElement>('[data-aura-glow]');
  }

  it('a gold tint rings the disc in the gold of the palette, at its opacity', () => {
    const { container } = renderPreviewWith(tokenFormOf(lyra({ aura: goldAura() }), METERS));

    expect(auraGlow(container)?.style.background).toContain('rgba(197, 164, 109');
    expect(auraGlow(container)?.style.opacity).toBe('0.5');
  });

  it('an aura of 2 cells is 2 × 2 × 52 + 52 = 260 px wide around a 1 × 1 disc', () => {
    const { container } = renderPreviewWith(tokenFormOf(lyra({ aura: goldAura() }), METERS));

    expect(auraGlow(container)?.style.width).toBe('260px');
  });

  it('a natural fire rings it in the natural tone of the fire', () => {
    const { container } = renderPreviewWith(tokenFormOf(lyra({ aura: fireAura() }), METERS));

    expect(auraGlow(container)?.style.background).toContain('rgba(255, 122, 42');
  });

  it('an image aura shows the image behind the disc', () => {
    const { container } = renderPreviewWith(tokenFormOf(lyra({ aura: runeAura() }), METERS));

    const image = auraGlow(container)?.querySelector('img');
    expect(image?.getAttribute('src')).toContain(RUNE_ASSET_ID);
    expect(discOf().contains(image ?? null)).toBe(false);
  });

  it('with a radius out of range, nothing rings the disc', () => {
    const form = tokenFormOf(lyra({ aura: goldAura() }), METERS);

    const { container } = renderPreviewWith({ ...form, aura: { ...form.aura, radius: '31' } });

    expect(auraGlow(container)).toBeNull();
  });
});
