import type { FramedAssetPurposeDto } from '@lorkarium/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageCropDialog } from '@/components/image-crop/image-crop-dialog';
import type { ImageCropRect } from '@/services/assets-api';
import { CENTER_STRIP, fakeCropAreaReporting } from '../../support/crop-area-fake';

const PHOTO = new File([new Uint8Array(8)], 'lork.png', { type: 'image/png' });

describe('ImageCropDialog', () => {
  let onConfirm: ReturnType<typeof vi.fn<(crop: ImageCropRect) => void>>;
  let onCancel: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    onConfirm = vi.fn<(crop: ImageCropRect) => void>();
    onCancel = vi.fn<() => void>();
  });

  function renderDialog(purpose: FramedAssetPurposeDto = 'campaign_photo') {
    render(
      <ImageCropDialog
        file={PHOTO}
        purpose={purpose}
        onConfirm={onConfirm}
        onCancel={onCancel}
        CropArea={fakeCropAreaReporting(CENTER_STRIP)}
      />,
    );
  }

  it('"Enviar" hands the rectangle the area reported, in percent', async () => {
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Recorte de teste' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(onConfirm).toHaveBeenCalledWith({ x: 10, y: 0, width: 80, height: 100 });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('"Enviar" waits until the area reports a rectangle', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
  });

  it('"Cancelar" gives up without sending anything', async () => {
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Recorte de teste' }));

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Esc gives up without sending anything', async () => {
    renderDialog();

    await userEvent.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it.each([
    ['campaign_photo', 'Recortar a foto da mesa', '1'],
    ['cover', 'Recortar a capa da mesa', '2'],
    ['campaign_banner', 'Recortar o banner da mesa', '3'],
  ] as const)('a %s is titled "%s" and framed at aspect %s', (purpose, title, aspect) => {
    renderDialog(purpose);

    expect(screen.getByRole('dialog', { name: title })).toBeInTheDocument();
    expect(screen.getByLabelText('Área de recorte')).toHaveAttribute('data-aspect', aspect);
  });

  it('the "Zoom" slider walks with the arrows and the area follows', async () => {
    renderDialog();
    const zoom = screen.getByRole('slider', { name: 'Zoom' });
    expect(zoom).toHaveAttribute('aria-valuetext', '1×');

    zoom.focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(zoom).toHaveAttribute('aria-valuetext', '1,1×');
    expect(screen.getByLabelText('Área de recorte')).toHaveAttribute('data-zoom', '1.1');
  });

  it('"+" zooms in and "-" zooms out anywhere in the dialog', async () => {
    renderDialog();
    screen.getByRole('button', { name: 'Recorte de teste' }).focus();

    await userEvent.keyboard('++-+');

    expect(screen.getByLabelText('Área de recorte')).toHaveAttribute('data-zoom', '1.2');
  });
});
