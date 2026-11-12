import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CampaignDetailDto } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { CampaignImageFields } from '@/features/campaigns/campaign-image-fields';
import { useCampaignSettingsDraft } from '@/features/campaigns/use-campaign-settings-draft';
import { AssetsApiFake, LYRA_PORTRAIT } from '../../support/assets-api-fake';
import { detailOf, VHARN } from '../../support/campaigns-api-fake';
import { CENTER_STRIP, fakeCropAreaReporting } from '../../support/crop-area-fake';

const PHOTO_ID = '1b2c3d4e-5f60-4a71-8b92-a3b4c5d6e7f8';
const COVER_ID = '2c3d4e5f-6071-4b82-9ca3-b4c5d6e7f809';
const DRAWN = { kind: 'drawn', drawing: 2, tone: 1 } as const;

// The fields over the real draft; the PATCH body it would send is written out for the spec to read.
function CampaignImageFieldsHost(
  props: Readonly<{ campaign: CampaignDetailDto; assets: AssetsApiFake }>,
): React.JSX.Element {
  const draft = useCampaignSettingsDraft(props.campaign);
  return (
    <>
      <CampaignImageFields
        draft={draft}
        campaignId={props.campaign.id}
        assets={props.assets}
        drawnCover={DRAWN}
        cropArea={fakeCropAreaReporting(CENTER_STRIP)}
      />
      <output aria-label="Corpo do PATCH">{JSON.stringify(draft.update)}</output>
    </>
  );
}

function patchBody(): unknown {
  return JSON.parse(screen.getByLabelText('Corpo do PATCH').textContent ?? 'null');
}

describe('CampaignImageFields · photo, cover and banner', () => {
  let assets: AssetsApiFake;

  beforeEach(() => {
    assets = new AssetsApiFake();
  });

  function renderSection(overrides: Partial<CampaignDetailDto> = {}): void {
    const campaign = detailOf(VHARN, overrides);
    render(<CampaignImageFieldsHost campaign={campaign} assets={assets} />);
  }

  const field = (name: 'Foto' | 'Capa' | 'Banner'): HTMLElement =>
    screen.getByRole('group', { name });

  const previewOf = (name: 'Foto' | 'Capa' | 'Banner'): Element | null =>
    field(name).querySelector('[data-campaign-image-preview]');

  it.each([
    ['Foto', 'aspect-square'],
    ['Capa', 'aspect-[2/1]'],
    ['Banner', 'aspect-[3/1]'],
  ] as const)('the field "%s" shows its preview in %s', (name, aspect) => {
    renderSection();
    expect(previewOf(name)?.firstElementChild).toHaveClass(aspect);
  });

  it('no photo: the preview shows the cover image and the hint says the cover is used', () => {
    renderSection({ cover: { kind: 'image', assetId: COVER_ID }, photoAssetId: null });
    expect(previewOf('Foto')?.querySelector('img')).toHaveAttribute(
      'src',
      `/api/assets/${COVER_ID}`,
    );
    expect(field('Foto')).toHaveTextContent('Sem foto, a mesa usa a capa.');
  });

  it('no banner over a drawn cover: the preview shows the drawing and the banner hint', () => {
    renderSection();
    expect(previewOf('Banner')?.firstElementChild).toHaveAttribute('data-cover-drawing', '2');
    expect(field('Banner')).toHaveTextContent('Sem banner, a mesa usa a capa.');
  });

  it('a photo set: its own image in the preview, no hint', () => {
    renderSection({ photoAssetId: PHOTO_ID });
    expect(previewOf('Foto')?.querySelector('img')).toHaveAttribute(
      'src',
      `/api/assets/${PHOTO_ID}`,
    );
    expect(field('Foto')).not.toHaveTextContent('Sem foto, a mesa usa a capa.');
  });

  it('a photo file goes through the 1:1 crop and enters the draft as photoAssetId', async () => {
    renderSection();
    const file = new File(['png'], 'foto.png', { type: 'image/png' });
    await userEvent.upload(within(field('Foto')).getByLabelText('Arquivo de imagem'), file);
    const dialog = await screen.findByRole('dialog', { name: 'Recortar a foto da mesa' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Recorte de teste' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar' }));

    await waitFor(() => expect(patchBody()).toEqual({ photoAssetId: LYRA_PORTRAIT.id }));
    expect(assets.sent).toMatchObject([
      { kind: 'upload', campaignId: VHARN.id, purpose: 'campaign_photo', crop: CENTER_STRIP },
    ]);
  });

  it('a banner link goes straight with purpose campaign_banner', async () => {
    renderSection();
    const banner = field('Banner');
    await userEvent.click(within(banner).getByRole('button', { name: 'Usar link de imagem' }));
    await userEvent.type(within(banner).getByLabelText('Link da imagem'), 'https://x.com/b.png');
    await userEvent.click(within(banner).getByRole('button', { name: 'Usar link' }));

    await waitFor(() => expect(patchBody()).toEqual({ bannerAssetId: LYRA_PORTRAIT.id }));
    expect(assets.sent).toMatchObject([{ kind: 'link', purpose: 'campaign_banner' }]);
  });

  it('removing the photo is "Usar a capa" and sends photoAssetId null', async () => {
    renderSection({ photoAssetId: PHOTO_ID });
    await userEvent.click(within(field('Foto')).getByRole('button', { name: 'Usar a capa' }));
    expect(patchBody()).toEqual({ photoAssetId: null });
  });

  it('removing the cover image is "Usar capa desenhada" and goes back to the drawing', async () => {
    renderSection({ cover: { kind: 'image', assetId: COVER_ID } });
    await userEvent.click(
      within(field('Capa')).getByRole('button', { name: 'Usar capa desenhada' }),
    );
    expect(patchBody()).toEqual({ cover: DRAWN });
  });
});
