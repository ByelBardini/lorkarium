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
  });
});
