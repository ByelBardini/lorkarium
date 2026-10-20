import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ImageSourceButtons } from '@/components/image-source-buttons';
import { useImageSender } from '@/components/use-image-sender';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { AssetsApiFake } from '../support/assets-api-fake';
import { VHARN } from '../support/campaigns-api-fake';

type ButtonsProps = Readonly<{ assets: AssetsApiFake; hasImage?: boolean; onRemove?: () => void }>;

function Buttons({ assets, hasImage = false, onRemove = () => undefined }: ButtonsProps) {
  const sender = useImageSender({
    campaignId: VHARN.id,
    purpose: 'token',
    assets,
    onSent: () => undefined,
  });
  return <ImageSourceButtons sender={sender} hasImage={hasImage} onRemove={onRemove} />;
}

function ButtonsInDialog({ assets }: Readonly<{ assets: AssetsApiFake }>) {
  const [open, setOpen] = useState(true);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>Imagem de Lyra</DialogTitle>
        <Buttons assets={assets} />
      </DialogContent>
    </Dialog>
  );
}

describe('ImageSourceButtons', () => {
  it('without an image: "Escolher imagem" and the link button, no bin', () => {
    render(<Buttons assets={new AssetsApiFake()} />);

    expect(screen.getByRole('button', { name: 'Escolher imagem' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Usar link de imagem' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remover imagem' })).not.toBeInTheDocument();
  });

  it('with an image: "Trocar imagem", and the bin removes it', async () => {
    const onRemove = vi.fn<() => void>();
    render(<Buttons assets={new AssetsApiFake()} hasImage onRemove={onRemove} />);

    await userEvent.click(screen.getByRole('button', { name: 'Remover imagem' }));

    expect(screen.getByRole('button', { name: 'Trocar imagem' })).toBeInTheDocument();
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('the link button opens a focused "Link da imagem" and closes it again', async () => {
    render(<Buttons assets={new AssetsApiFake()} />);
    const link = screen.getByRole('button', { name: 'Usar link de imagem' });

    await userEvent.click(link);
    expect(screen.getByLabelText('Link da imagem')).toHaveFocus();
    expect(link).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(link);

    expect(screen.queryByLabelText('Link da imagem')).not.toBeInTheDocument();
  });

  it('Esc in the link field inside a dialog closes only the field, and the dialog stays', async () => {
    render(<ButtonsInDialog assets={new AssetsApiFake()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Usar link de imagem' }));

    await userEvent.type(screen.getByLabelText('Link da imagem'), 'https://x.com/a{Escape}');

    expect(screen.queryByLabelText('Link da imagem')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Imagem de Lyra' })).toBeInTheDocument();
  });

  it('Esc out of the link field still closes the dialog', async () => {
    render(<ButtonsInDialog assets={new AssetsApiFake()} />);

    screen.getByRole('button', { name: 'Escolher imagem' }).focus();
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
