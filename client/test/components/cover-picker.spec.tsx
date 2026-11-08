import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CampaignCoverDto } from '@lorkarium/contracts';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { CoverPicker } from '@/components/cover-picker';

function Harness({ initial }: Readonly<{ initial: CampaignCoverDto }>) {
  const [cover, setCover] = useState<CampaignCoverDto>(initial);
  return (
    <>
      <CoverPicker
        value={cover}
        onChange={setCover}
        image={<button type="button">Enviar imagem</button>}
      />
      <output aria-label="Capa">{JSON.stringify(cover)}</output>
    </>
  );
}

function drawings(): HTMLElement {
  return screen.getByRole('radiogroup', { name: 'Desenho' });
}

function tones(): HTMLElement {
  return screen.getByRole('radiogroup', { name: 'Tom' });
}

function chosen(): unknown {
  return JSON.parse(screen.getByLabelText('Capa').textContent ?? 'null');
}

function customTile(): HTMLElement {
  return screen.getByRole('button', { name: /^Cor personalizada/ });
}

async function applyTypedColor(color: string): Promise<void> {
  await userEvent.click(customTile());
  const code = await screen.findByLabelText('Código da cor');
  await userEvent.clear(code);
  await userEvent.type(code, color);
  await userEvent.click(screen.getByRole('button', { name: 'Usar cor' }));
}

describe('CoverPicker', () => {
  it('the drawn cover marks its drawing and its tone', () => {
    render(<Harness initial={{ kind: 'drawn', drawing: 1, tone: 3 }} />);

    expect(within(drawings()).getByRole('radio', { name: 'Costa' })).toBeChecked();
    expect(within(tones()).getByRole('radio', { name: 'Brasa' })).toBeChecked();
    expect(within(drawings()).getAllByRole('radio')).toHaveLength(3);
    expect(within(tones()).getAllByRole('radio')).toHaveLength(4);
  });

  it('clicking another drawing keeps the tone', async () => {
    render(<Harness initial={{ kind: 'drawn', drawing: 1, tone: 3 }} />);

    await userEvent.click(within(drawings()).getByRole('radio', { name: 'Montanhas' }));

    expect(chosen()).toEqual({ kind: 'drawn', drawing: 2, tone: 3 });
  });

  it('the arrow key moves the tone to the next one', async () => {
    render(<Harness initial={{ kind: 'drawn', drawing: 0, tone: 1 }} />);
    within(tones()).getByRole('radio', { name: 'Dourado' }).focus();

    // Radix moves the focus on a timer and checks only while the arrow is still down, so the key
    // is held until the check lands (a full press releases it before the focus moves).
    await userEvent.keyboard('{ArrowRight>}');

    await waitFor(() => expect(within(tones()).getByRole('radio', { name: 'Aço' })).toBeChecked());
    await userEvent.keyboard('{/ArrowRight}');
    expect(chosen()).toEqual({ kind: 'drawn', drawing: 0, tone: 2 });
  });

  it('an image cover checks no drawing nor tone; picking a tone goes back to a drawn cover', async () => {
    const image = { kind: 'image', assetId: 'e1d2c3b4-a596-4877-8899-aabbccddeeff' } as const;
    render(<Harness initial={image} />);
    expect(within(drawings()).queryByRole('radio', { checked: true })).toBeNull();
    expect(within(tones()).queryByRole('radio', { checked: true })).toBeNull();

    await userEvent.click(within(tones()).getByRole('radio', { name: 'Musgo' }));

    expect(chosen()).toEqual({ kind: 'drawn', drawing: 0, tone: 4 });
  });

  it('renders the image slot it is given', () => {
    render(<Harness initial={{ kind: 'drawn', drawing: 0, tone: 1 }} />);

    expect(screen.getByRole('button', { name: 'Enviar imagem' })).toBeInTheDocument();
  });

  it('disabled turns every drawing and tone off', () => {
    render(
      <CoverPicker
        value={{ kind: 'drawn', drawing: 0, tone: 1 }}
        onChange={() => undefined}
        disabled
      />,
    );

    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
    expect(customTile()).toBeDisabled();
  });

  describe('the custom tone', () => {
    const CUSTOM = { kind: 'drawn', drawing: 1, tone: '#336699' } as const;

    it('a numeric tone checks its radio and leaves the tile unmarked', () => {
      render(<Harness initial={{ kind: 'drawn', drawing: 1, tone: 3 }} />);

      expect(within(tones()).getByRole('radio', { name: 'Brasa' })).toBeChecked();
      expect(customTile()).toHaveAccessibleName('Cor personalizada');
    });

    it('a hex tone checks no radio and marks the tile, keeping its drawing checked', () => {
      render(<Harness initial={CUSTOM} />);

      expect(within(tones()).queryByRole('radio', { checked: true })).toBeNull();
      expect(customTile()).toHaveAccessibleName('Cor personalizada: #336699');
      expect(within(drawings()).getByRole('radio', { name: 'Costa' })).toBeChecked();
    });

    it('an image cover marks nothing, the tile included', () => {
      const assetId = 'e1d2c3b4-a596-4877-8899-aabbccddeeff';
      render(<Harness initial={{ kind: 'image', assetId }} />);

      expect(within(tones()).queryByRole('radio', { checked: true })).toBeNull();
      expect(customTile()).toHaveAccessibleName('Cor personalizada');
    });

    it('"Usar cor" swaps the tone for the hex and keeps the drawing', async () => {
      render(<Harness initial={{ kind: 'drawn', drawing: 2, tone: 1 }} />);

      await applyTypedColor('#336699');

      expect(chosen()).toEqual({ kind: 'drawn', drawing: 2, tone: '#336699' });
      expect(within(tones()).queryByRole('radio', { checked: true })).toBeNull();
    });

    it('over an image cover, "Usar cor" goes back to a drawn cover in that color', async () => {
      const assetId = 'e1d2c3b4-a596-4877-8899-aabbccddeeff';
      render(<Harness initial={{ kind: 'image', assetId }} />);

      await applyTypedColor('#336699');

      expect(chosen()).toEqual({ kind: 'drawn', drawing: 0, tone: '#336699' });
    });

    it('another drawing keeps the hex, and the previews are drawn in it', async () => {
      const { container } = render(<Harness initial={CUSTOM} />);

      await userEvent.click(within(drawings()).getByRole('radio', { name: 'Montanhas' }));

      expect(chosen()).toEqual({ kind: 'drawn', drawing: 2, tone: '#336699' });
      const previews = container.querySelectorAll('[data-cover-tone="#336699"]');
      expect(previews).toHaveLength(3);
    });

    it('picking a fixed tone leaves the hex behind', async () => {
      render(<Harness initial={CUSTOM} />);

      await userEvent.click(within(tones()).getByRole('radio', { name: 'Aço' }));

      expect(chosen()).toEqual({ kind: 'drawn', drawing: 1, tone: 2 });
      expect(customTile()).toHaveAccessibleName('Cor personalizada');
    });

    it('the arrows stay on the fixed tones and never open the panel', async () => {
      render(<Harness initial={{ kind: 'drawn', drawing: 0, tone: 4 }} />);
      within(tones()).getByRole('radio', { name: 'Musgo' }).focus();

      await userEvent.keyboard('{ArrowRight>}');

      await waitFor(() =>
        expect(within(tones()).getByRole('radio', { name: 'Dourado' })).toBeChecked(),
      );
      await userEvent.keyboard('{/ArrowRight}');
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});
