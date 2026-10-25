import type { AssetDto, AssetPurposeDto } from '@lorkarium/contracts';
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
  removeLabel?: string;
  purpose?: AssetPurposeDto;
}>;

function Harness({ assets, onChange, initial = null, removeLabel, purpose }: HarnessProps) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <ImagePicker
      campaignId={VHARN.id}
      purpose={purpose ?? 'token'}
      assets={assets}
      value={value}
      label="Imagem"
      removeLabel={removeLabel}
      onChange={(asset) => {
        setValue(asset?.id ?? null);
        onChange(asset);
      }}
    />
  );
}

async function openLink(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole('button', { name: 'Usar link de imagem' }));
  return screen.getByLabelText('Link da imagem');
}

describe('ImagePicker', () => {
  let assets: AssetsApiFake;
  let onChange: ReturnType<typeof vi.fn<(asset: AssetDto | null) => void>>;

  beforeEach(() => {
    assets = new AssetsApiFake();
    onChange = vi.fn<(asset: AssetDto | null) => void>();
  });

  it('without an image there are "Escolher imagem" and the link button, and no bin', () => {
    render(<Harness assets={assets} onChange={onChange} />);

    expect(screen.getByRole('button', { name: 'Escolher imagem' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Usar link de imagem' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remover imagem' })).not.toBeInTheDocument();
  });

  it('a PNG on "Arquivo de imagem" sends it, shows "Enviando…" busy, then the preview and the new asset', async () => {
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

  it('pasting an image (Ctrl+V) on the area sends it the same way', async () => {
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

  it('the link button opens a focused "Link da imagem"; "Usar link" imports it and the field closes', async () => {
    render(<Harness assets={assets} onChange={onChange} />);

    const link = await openLink();
    expect(link).toHaveFocus();
    await userEvent.type(link, 'https://x.com/lyra.png');
    await userEvent.click(screen.getByRole('button', { name: 'Usar link' }));

    expect(assets.sent).toEqual([
      { kind: 'link', campaignId: VHARN.id, url: 'https://x.com/lyra.png', purpose: 'token' },
    ]);
    expect(onChange).toHaveBeenCalledWith(LYRA_PORTRAIT);
    expect(screen.queryByLabelText('Link da imagem')).not.toBeInTheDocument();
  });

  it('Enter in "Link da imagem" imports it too', async () => {
    render(<Harness assets={assets} onChange={onChange} />);

    await userEvent.type(await openLink(), 'https://x.com/lyra.png{Enter}');

    expect(assets.sent).toEqual([
      { kind: 'link', campaignId: VHARN.id, url: 'https://x.com/lyra.png', purpose: 'token' },
    ]);
  });

  it('"Usar link" is disabled while the link is empty', async () => {
    render(<Harness assets={assets} onChange={onChange} />);

    await openLink();

    expect(screen.getByRole('button', { name: 'Usar link' })).toBeDisabled();
  });

  it('Esc in "Link da imagem" closes the field without sending', async () => {
    render(<Harness assets={assets} onChange={onChange} />);

    await userEvent.type(await openLink(), 'https://x.com/a{Escape}');

    expect(screen.queryByLabelText('Link da imagem')).not.toBeInTheDocument();
    expect(assets.sent).toEqual([]);
  });

  it('with an image, the button reads "Trocar imagem" and the bin clears it with null', async () => {
    render(<Harness assets={assets} onChange={onChange} initial={LYRA_PORTRAIT.id} />);

    expect(screen.getByRole('button', { name: 'Trocar imagem' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remover imagem' }));

    expect(onChange).toHaveBeenCalledWith(null);
    expect(screen.queryByRole('img', { name: 'Imagem escolhida' })).not.toBeInTheDocument();
  });

  it('the removeLabel names the bin ("Remover fundo")', () => {
    render(
      <Harness
        assets={assets}
        onChange={onChange}
        initial={LYRA_PORTRAIT.id}
        removeLabel="Remover fundo"
      />,
    );

    expect(screen.getByRole('button', { name: 'Remover fundo' })).toBeInTheDocument();
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

  it('for the aura, a GIF is sent with the purpose aura and the file dialog offers GIF', async () => {
    render(<Harness assets={assets} onChange={onChange} purpose="aura" />);
    const gif = fileOf('image/gif');

    fireEvent.change(screen.getByLabelText('Arquivo de imagem'), {
      target: { files: filesOf(gif) },
    });

    expect(await screen.findByAltText('Imagem escolhida')).toBeInTheDocument();
    expect(assets.sent).toEqual([
      { kind: 'upload', campaignId: VHARN.id, file: gif, purpose: 'aura' },
    ]);
    expect(screen.getByLabelText('Arquivo de imagem')).toHaveAttribute(
      'accept',
      'image/png,image/jpeg,image/webp,image/gif',
    );
  });

  it('for the aura the hint tells GIF animado; for a token it does not', () => {
    const { unmount } = render(<Harness assets={assets} onChange={onChange} purpose="aura" />);
    expect(screen.getByRole('group', { name: 'Área da imagem' })).toHaveAccessibleDescription(
      'Solte a imagem aqui ou cole com Ctrl+V. PNG, JPEG, WebP ou GIF animado, até 20 MB.',
    );
    unmount();

    render(<Harness assets={assets} onChange={onChange} />);
    expect(screen.getByRole('group', { name: 'Área da imagem' })).toHaveAccessibleDescription(
      'Solte a imagem aqui ou cole com Ctrl+V. PNG, JPEG ou WebP, até 20 MB.',
    );
    expect(screen.getByLabelText('Arquivo de imagem')).toHaveAttribute(
      'accept',
      'image/png,image/jpeg,image/webp',
    );
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
  ] as const)('a refused link (%o) says why and keeps the link typed', async (failure, message) => {
    assets.answerWith({ ok: false, failure });
    render(<Harness assets={assets} onChange={onChange} />);

    await userEvent.type(await openLink(), 'https://x.com/a');
    await userEvent.click(screen.getByRole('button', { name: 'Usar link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText('Link da imagem')).toHaveValue('https://x.com/a');
    expect(onChange).not.toHaveBeenCalled();
  });
});
