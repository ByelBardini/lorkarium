import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CropArea from '@/components/image-crop/crop-area';

// jsdom decodes no image, so react-easy-crop never measures nor reports an area here: the
// rectangle the dialog sends is proven with the fake area (image-crop-dialog.spec.tsx).
describe('CropArea', () => {
  it('shows the chosen file itself under the frame, read as a data URL', async () => {
    const png = new File([new Uint8Array([137, 80, 78, 71])], 'lork.png', { type: 'image/png' });

    render(
      <CropArea image={png} aspect={3} zoom={1} onZoomChange={() => {}} onAreaChange={() => {}} />,
    );

    const image = await screen.findByRole('img', { name: 'Imagem a recortar' });
    expect(image.getAttribute('src')).toBe('data:image/png;base64,iVBORw==');
  });
});
