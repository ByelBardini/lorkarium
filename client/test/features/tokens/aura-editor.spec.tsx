import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { TokenAuraDto } from '@lorkarium/contracts';
import { AuraEditor } from '@/features/tokens/aura-editor';
import { auraFormOf, type AuraFormErrors } from '@/features/tokens/aura-form-state';
import { AssetsApiFake } from '../../support/assets-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import { fireAura, goldAura, runeAura } from '../../support/aura-fixtures';

const METERS = { cellDistance: 1.5, cellUnit: 'm' };

function Harness({
  aura = null,
  errors = {},
}: Readonly<{ aura?: TokenAuraDto | null; errors?: AuraFormErrors }>) {
  const [form, setForm] = useState(auraFormOf(aura, METERS));
  const images = { campaignId: VHARN.id, assets: new AssetsApiFake() };
  return (
    <AuraEditor form={form} errors={errors} distance={METERS} images={images} onChange={setForm} />
  );
}

function kindGroup(): HTMLElement {
  return screen.getByRole('radiogroup', { name: 'Aura' });
}

async function pickKind(name: string): Promise<void> {
  await userEvent.click(screen.getByRole('radio', { name }));
}

describe('AuraEditor', () => {
  it('"Aura" offers Nenhuma, Cor, Efeito and Imagem, with Nenhuma checked on a token without one', () => {
    render(<Harness />);

    expect(kindGroup()).toBeInTheDocument();
    const names = ['Nenhuma', 'Cor', 'Efeito', 'Imagem'];
    expect(names.map((name) => screen.getByRole('radio', { name }).ariaChecked)).toEqual([
      'true',
      'false',
      'false',
      'false',
    ]);
    expect(screen.queryByLabelText('Raio além da borda (m)')).not.toBeInTheDocument();
  });

  it('Cor shows the eight tiles of the palette and no "Natural"', async () => {
    render(<Harness />);

    await pickKind('Cor');

    const tiles = screen.getByRole('radiogroup', { name: 'Cor da aura' });
    expect(tiles.querySelectorAll('[role="radio"]')).toHaveLength(8);
    expect(screen.getByRole('radio', { name: 'Ouro' })).toBeChecked();
    expect(screen.queryByRole('radio', { name: 'Natural' })).not.toBeInTheDocument();
  });

  it('Efeito shows the eight effects with Fogo checked, and "Natural" checked as the color', async () => {
    render(<Harness />);

    await pickKind('Efeito');

    const effects = ['Fogo', 'Água', 'Elétrico', 'Gelo', 'Sagrado', 'Sombrio', 'Veneno', 'Arcano'];
    for (const name of effects) expect(screen.getByRole('radio', { name })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Fogo' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Natural' })).toBeChecked();
  });

  it('Imagem shows the picker, telling PNG, JPEG, WebP or GIF animado up to 20 MB', async () => {
    render(<Harness />);

    await pickKind('Imagem');

    expect(screen.getByRole('group', { name: 'Área da imagem' })).toHaveAccessibleDescription(
      'Solte a imagem aqui ou cole com Ctrl+V. PNG, JPEG, WebP ou GIF animado, até 20 MB.',
    );
  });

  it('Imagem offers the shape Quadrada or Redonda, Quadrada checked at first', async () => {
    render(<Harness />);

    await pickKind('Imagem');

    expect(screen.getByRole('radiogroup', { name: 'Forma' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Quadrada' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Redonda' })).not.toBeChecked();
  });

  it('picking Redonda checks it', async () => {
    render(<Harness aura={runeAura()} />);

    await pickKind('Redonda');

    expect(screen.getByRole('radio', { name: 'Redonda' })).toBeChecked();
  });

  it('a round image aura opens on Redonda', () => {
    render(<Harness aura={runeAura({ shape: 'round' })} />);

    expect(screen.getByRole('radio', { name: 'Redonda' })).toBeChecked();
  });

  it('Cor shows no shape: only an image is cut', async () => {
    render(<Harness />);

    await pickKind('Cor');

    expect(screen.queryByRole('radiogroup', { name: 'Forma' })).not.toBeInTheDocument();
  });

  it('a fire aura of 2 cells opens on Efeito Fogo with the radius at "3" (= 2 casas)', () => {
    render(<Harness aura={fireAura()} />);

    expect(screen.getByRole('radio', { name: 'Efeito' })).toBeChecked();
    expect(screen.getByLabelText('Raio além da borda (m)')).toHaveValue('3');
    expect(screen.getByText('= 2 casas')).toBeInTheDocument();
  });

  it('"Opacidade" says 50% on a gold tint and walks 5 by 5 with the arrows', async () => {
    render(<Harness aura={goldAura()} />);
    const opacity = screen.getByRole('slider', { name: 'Opacidade' });
    expect(opacity).toHaveAttribute('aria-valuetext', '50%');

    opacity.focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(opacity).toHaveAttribute('aria-valuetext', '55%');
    expect(screen.getByText('55%')).toBeInTheDocument();
  });

  it('a radius error is told under the field, which is marked invalid', () => {
    render(<Harness aura={goldAura()} errors={{ radius: 'De 0 a 30 m.' }} />);

    const radius = screen.getByLabelText('Raio além da borda (m)');
    expect(radius).toHaveAttribute('aria-invalid', 'true');
    expect(radius).toHaveAccessibleDescription('De 0 a 30 m.');
  });

  it('an image error is told under the picker', async () => {
    render(<Harness errors={{ image: 'Escolha a imagem da aura.' }} />);

    await pickKind('Imagem');

    expect(screen.getByText('Escolha a imagem da aura.')).toBeInTheDocument();
  });
});
