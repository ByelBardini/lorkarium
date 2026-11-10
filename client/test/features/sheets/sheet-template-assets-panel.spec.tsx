import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { SheetTemplateAssetsPanel } from '@/features/sheets/sheet-template-assets-panel';
import { readSheetManifestText } from '@/lib/sheet-template-manifest';
import { SheetTemplatesApiFake } from '../../support/sheet-templates-api-fake';

const CAMPAIGN_ID = '10000000-0000-4000-8000-000000000001';
const FONT_ID = '00000000-0000-4000-8000-0000000000f1';
const EMPTY = '{"permissions":[],"bars":[]}';

function Editable({ start, api }: Readonly<{ start: string; api: SheetTemplatesApiFake }>) {
  const [manifest, setManifest] = useState(start);
  return (
    <>
      <SheetTemplateAssetsPanel
        manifest={manifest}
        onManifest={setManifest}
        ports={{ api, campaignId: CAMPAIGN_ID }}
      />
      <output aria-label="Manifesto atual">{manifest}</output>
    </>
  );
}

function declaredPaths(): string[] {
  const reading = readSheetManifestText(screen.getByLabelText('Manifesto atual').textContent ?? '');
  return reading.ok ? reading.manifest.assets.map(({ path }) => path) : [];
}

function fontFile(): File {
  return new File([new Uint8Array([0x77, 0x4f, 0x46, 0x32])], 'cormorant.woff2');
}

async function send(path: string, file: File = fontFile()) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Caminho do asset'), path);
  await user.upload(screen.getByLabelText('Arquivo do asset'), file);
  await user.click(screen.getByRole('button', { name: 'Enviar asset' }));
  return user;
}

describe('SheetTemplateAssetsPanel', () => {
  it('sends a font as font/woff2 and declares it at the path typed', async () => {
    const api = new SheetTemplatesApiFake();
    render(<Editable start={EMPTY} api={api} />);

    await send('fontes/cormorant.woff2');

    expect(api.uploads.map(({ campaignId, type }) => [campaignId, type])).toEqual([
      [CAMPAIGN_ID, 'font/woff2'],
    ]);
    expect(declaredPaths()).toEqual(['fontes/cormorant.woff2']);
    const list = screen.getByRole('list', { name: 'Assets declarados' });
    expect(within(list).getByText('asset:fontes/cormorant.woff2')).toBeInTheDocument();
  });

  it('a path with another extension is refused before anything is sent', async () => {
    const api = new SheetTemplatesApiFake();
    render(<Editable start={EMPTY} api={api} />);

    await send('fontes/cormorant.ttf');

    expect(screen.getByRole('alert')).toHaveTextContent('Caminho inválido');
    expect(api.uploads).toEqual([]);
    expect(declaredPaths()).toEqual([]);
  });

  it('a refused upload says why and declares nothing', async () => {
    const api = new SheetTemplatesApiFake();
    api.assetAnswer = { ok: false, failure: { kind: 'too_large' } };
    render(<Editable start={EMPTY} api={api} />);

    await send('img/brasao.png', new File([new Uint8Array(4)], 'brasao.png'));

    expect(screen.getByRole('alert')).toHaveTextContent('O arquivo é grande demais');
    expect(declaredPaths()).toEqual([]);
  });

  it('"Tirar" takes a declared asset out of the manifest', async () => {
    const start = JSON.stringify({
      permissions: [],
      bars: [],
      assets: [{ path: 'img/brasao.png', assetId: FONT_ID }],
    });
    render(<Editable start={start} api={new SheetTemplatesApiFake()} />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Tirar img/brasao.png' }));

    expect(declaredPaths()).toEqual([]);
    expect(screen.getByText('Nenhum asset declarado.')).toBeInTheDocument();
  });

  it('a manifest that does not read offers no upload', () => {
    render(<Editable start="{ quebrado" api={new SheetTemplatesApiFake()} />);

    expect(screen.queryByRole('button', { name: 'Enviar asset' })).toBeNull();
    expect(screen.getByText('Corrija o manifesto para enviar assets.')).toBeInTheDocument();
  });
});
