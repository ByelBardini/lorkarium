import type { AssetDto } from '@lorkarium/contracts';
import { act, createEvent, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImagePicker } from '@/components/image-picker';
import { AssetsApiFake, LYRA_PORTRAIT } from '../support/assets-api-fake';
import { VHARN } from '../support/campaigns-api-fake';

const MB = 1024 * 1024;

function fileOf(type: string, size = 1024): File {
  return new File([new Uint8Array(size)], 'lyra', { type });
}

function filesOf(...files: File[]): FileList {
  return files as unknown as FileList;
}

type HarnessProps = Readonly<{
  assets: AssetsApiFake;
  onChange: (asset: AssetDto | null) => void;
  initial?: string | null;
}>;

function Harness({ assets, onChange, initial = null }: HarnessProps): React.JSX.Element {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <ImagePicker
      campaignId={VHARN.id}
      purpose="token"
      assets={assets}
      value={value}
      label="Imagem"
      onChange={(asset) => {
        setValue(asset?.id ?? null);
        onChange(asset);
      }}
    />
  );
}

describe('ImagePicker', () => {
  let assets: AssetsApiFake;
  let onChange: ReturnType<typeof vi.fn<(asset: AssetDto | null) => void>>;

  beforeEach(() => {
    assets = new AssetsApiFake();
    onChange = vi.fn<(asset: AssetDto | null) => void>();
  });

  it('choosing a PNG sends it, shows "Enviando…" busy, then the preview and the new asset', async () => {
    assets.hold();
    render(<Harness assets={assets} onChange={onChange} />);
    const png = fileOf('image/png');

    await userEvent.upload(screen.getByLabelText('Arquivo de imagem'), png);

    expect(screen.getByRole('status')).toHaveTextContent('Enviando…');
    expect(screen.getByRole('group', { name: 'Imagem' })).toHaveAttribute('aria-busy', 'true');
    await act(async () => assets.release());
    expect(screen.getByRole('img', { name: 'Imagem escolhida' })).toHaveAttribute(
      'src',
      `/api/assets/${LYRA_PORTRAIT.id}`,
    );
    expect(onChange).toHaveBeenCalledWith(LYRA_PORTRAIT);
    expect(assets.sent).toEqual([
      { kind: 'upload', campaignId: VHARN.id, file: png, purpose: 'token' },
    ]);
  });

  it('dropping a file on the area sends it the same way', async () => {
    render(<Harness assets={assets} onChange={onChange} />);
    const png = fileOf('image/png');

    await act(async () => {
      fireEvent.drop(screen.getByRole('group', { name: 'Área da imagem' }), {
        dataTransfer: { files: filesOf(png) },
      });
    });

    expect(assets.sent).toEqual([
      { kind: 'upload', campaignId: VHARN.id, file: png, purpose: 'token' },
    ]);
    expect(onChange).toHaveBeenCalledWith(LYRA_PORTRAIT);
  });

  it('pasting an image (Ctrl+V) sends it the same way', async () => {
    render(<Harness assets={assets} onChange={onChange} />);
    const area = screen.getByRole('group', { name: 'Área da imagem' });
    const png = fileOf('image/webp');
    const paste = createEvent.paste(area);
    Object.defineProperty(paste, 'clipboardData', { value: { files: filesOf(png) } });

    await act(async () => {
      fireEvent(area, paste);
    });

    expect(assets.sent).toEqual([
      { kind: 'upload', campaignId: VHARN.id, file: png, purpose: 'token' },
    ]);
  });

  it('a link and "Usar link" import it with the purpose of the picker', async () => {
    render(<Harness assets={assets} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('Link da imagem'), 'https://x.com/lyra.png');
    await userEvent.click(screen.getByRole('button', { name: 'Usar link' }));

    expect(assets.sent).toEqual([
      { kind: 'link', campaignId: VHARN.id, url: 'https://x.com/lyra.png', purpose: 'token' },
    ]);
    expect(onChange).toHaveBeenCalledWith(LYRA_PORTRAIT);
  });

  it('"Remover imagem" clears the choice with null', async () => {
    render(<Harness assets={assets} onChange={onChange} initial={LYRA_PORTRAIT.id} />);

    await userEvent.click(screen.getByRole('button', { name: 'Remover imagem' }));

    expect(onChange).toHaveBeenCalledWith(null);
    expect(screen.queryByRole('img', { name: 'Imagem escolhida' })).toBeNull();
  });

  it('a second file while the first is sending is ignored', async () => {
    assets.hold();
    render(<Harness assets={assets} onChange={onChange} />);
    const input = screen.getByLabelText('Arquivo de imagem');

    await userEvent.upload(input, fileOf('image/png'));
    fireEvent.change(input, { target: { files: filesOf(fileOf('image/jpeg')) } });

    expect(assets.sent).toHaveLength(1);
  });

  it('a GIF is refused before sending, asking for PNG, JPEG or WebP', async () => {
    render(<Harness assets={assets} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Arquivo de imagem'), {
      target: { files: filesOf(fileOf('image/gif')) },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Use PNG, JPEG ou WebP.');
    expect(assets.sent).toEqual([]);
  });

  it('a file of 25 MB is refused before sending', async () => {
    render(<Harness assets={assets} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Arquivo de imagem'), {
      target: { files: filesOf(fileOf('image/png', 25 * MB)) },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('A imagem passa de 20 MB.');
    expect(assets.sent).toEqual([]);
  });

  it.each([
    [
      { kind: 'link_not_image' },
      'Esse link não é de uma imagem. Abra a imagem e copie o endereço dela.',
    ],
    [{ kind: 'link_blocked' }, 'Esse link não pode ser usado.'],
    [{ kind: 'rate_limited', retryAfterSeconds: 12 }, 'Muitos envios seguidos. Espere 12 s.'],
    [{ kind: 'offline' }, 'Sem conexão com o servidor. Confira sua internet e tente de novo.'],
  ] as const)('a refused link (%o) says why and keeps the choice', async (failure, message) => {
    assets.answerWith({ ok: false, failure });
    render(<Harness assets={assets} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('Link da imagem'), 'https://x.com/a');
    await userEvent.click(screen.getByRole('button', { name: 'Usar link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(onChange).not.toHaveBeenCalled();
  });
});
