import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CampaignCover } from '@/components/campaign-cover';

const ASSET_ID = 'e1d2c3b4-a596-4877-8899-aabbccddeeff';

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
});
