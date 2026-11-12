import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CampaignCover } from '@/components/campaign-cover';

const ASSET_ID = 'e1d2c3b4-a596-4877-8899-aabbccddeeff';
const PHOTO_ID = 'a1a1a1a1-0000-4000-8000-000000000001';
const BANNER_ID = 'b3b3b3b3-0000-4000-8000-000000000003';
const IMAGE_COVER = { kind: 'image', assetId: ASSET_ID } as const;

describe('CampaignCover', () => {
  it('an image cover shows the asset as a decorative image (empty alt)', () => {
    const { container } = render(<CampaignCover cover={{ kind: 'image', assetId: ASSET_ID }} />);

    const image = container.querySelector('img');
    expect(image).toHaveAttribute('src', `/api/assets/${ASSET_ID}`);
    expect(image).toHaveAttribute('alt', '');
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('a drawn cover draws the chosen drawing in the chosen tone, with no image', () => {
    const { container } = render(<CampaignCover cover={{ kind: 'drawn', drawing: 1, tone: 3 }} />);

    const cover = container.firstElementChild;
    expect(cover).toHaveAttribute('data-cover-drawing', '1');
    expect(cover).toHaveAttribute('data-cover-tone', '3');
    expect(cover).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelectorAll('path')).toHaveLength(3);
  });

  it('a numeric tone keeps its chart class, with no inline color', () => {
    const { container } = render(<CampaignCover cover={{ kind: 'drawn', drawing: 1, tone: 3 }} />);

    const art = container.querySelector('svg');
    expect(art).toHaveClass('text-chart-3');
    expect(art?.style.color).toBe('');
  });

  it('a custom tone paints the art by inline color, with no chart class', () => {
    const cover = { kind: 'drawn', drawing: 1, tone: '#336699' } as const;
    const { container } = render(<CampaignCover cover={cover} />);

    const art = container.querySelector('svg');
    expect(art).toHaveStyle({ color: '#336699' });
    expect(art?.getAttribute('class')).not.toMatch(/text-chart/);
    expect(container.firstElementChild).toHaveAttribute('data-cover-tone', '#336699');
  });

  describe('format', () => {
    it('format photo with a photo shows the photo image', () => {
      const { container } = render(
        <CampaignCover cover={IMAGE_COVER} photoAssetId={PHOTO_ID} format="photo" />,
      );

      expect(container.querySelector('img')).toHaveAttribute('src', `/api/assets/${PHOTO_ID}`);
    });

    it('format banner with a banner shows the banner image', () => {
      const { container } = render(
        <CampaignCover cover={IMAGE_COVER} bannerAssetId={BANNER_ID} format="banner" />,
      );

      expect(container.querySelector('img')).toHaveAttribute('src', `/api/assets/${BANNER_ID}`);
    });

    it('format banner without a banner shows the cover image', () => {
      const { container } = render(
        <CampaignCover cover={IMAGE_COVER} bannerAssetId={null} format="banner" />,
      );

      expect(container.querySelector('img')).toHaveAttribute('src', `/api/assets/${ASSET_ID}`);
    });

    it('format photo without a photo and with a drawn cover keeps the drawing attributes', () => {
      const cover = { kind: 'drawn', drawing: 2, tone: 1 } as const;
      const { container } = render(<CampaignCover cover={cover} format="photo" />);

      expect(container.firstElementChild).toHaveAttribute('data-cover-drawing', '2');
      expect(container.firstElementChild).toHaveAttribute('data-cover-tone', '1');
      expect(container.querySelector('img')).toBeNull();
    });

    it.each([
      ['photo', 'aspect-square'],
      ['cover', 'aspect-[2/1]'],
      ['banner', 'aspect-[3/1]'],
    ] as const)('format %s takes the %s proportion', (format, aspect) => {
      const { container } = render(<CampaignCover cover={IMAGE_COVER} format={format} />);

      expect(container.firstElementChild).toHaveClass(aspect);
    });

    it('no format draws the cover with no proportion class, as the screens size it today', () => {
      const { container } = render(
        <CampaignCover cover={IMAGE_COVER} photoAssetId={PHOTO_ID} className="h-6 w-8" />,
      );

      expect(container.querySelector('img')).toHaveAttribute('src', `/api/assets/${ASSET_ID}`);
      expect(container.firstElementChild?.getAttribute('class')).not.toMatch(/aspect-/);
    });
  });
});
