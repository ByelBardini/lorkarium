import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MemberBannerBackdrop } from '@/features/sessions/member-banner-backdrop';
import { useBannerHover } from '@/features/sessions/use-banner-hover';
import { emulateReducedMotion } from '../../support/viewport';

const BANNER_ID = '3c2b1a09-8f7e-4d6c-9b5a-4e3d2c1b0a9f';

function BannerRow({ bannerId }: Readonly<{ bannerId: string | null }>): React.JSX.Element {
  const hover = useBannerHover();
  return (
    <div role="listitem" {...hover.rowHandlers}>
      <MemberBannerBackdrop bannerId={bannerId} moving={hover.moving} />
      Bia
    </div>
  );
}

const row = () => screen.getByRole('listitem');
const backdrop = () => row().querySelector('[data-banner-backdrop]');
const movingBanner = () => row().querySelector('img');

describe('MemberBannerBackdrop', () => {
  it('without a banner there is no backdrop', () => {
    render(<BannerRow bannerId={null} />);

    expect(backdrop()).toBeNull();
  });

  it('with a banner, still: its first frame on a canvas, out of the accessibility tree', () => {
    render(<BannerRow bannerId={BANNER_ID} />);

    expect(backdrop()).toHaveAttribute('aria-hidden', 'true');
    expect(backdrop()?.querySelector('[data-banner-still]')).toBeInTheDocument();
    expect(movingBanner()).toBeNull();
  });

  it('the pointer over the row plays the banner; leaving stills it again', async () => {
    const user = userEvent.setup();
    render(<BannerRow bannerId={BANNER_ID} />);

    await user.hover(row());
    expect(movingBanner()).toHaveAttribute('src', `/api/banners/${BANNER_ID}`);

    await user.unhover(row());
    expect(movingBanner()).toBeNull();
  });

  describe('asking for less motion', () => {
    emulateReducedMotion();

    it('the pointer over the row keeps the banner still', async () => {
      const user = userEvent.setup();
      render(<BannerRow bannerId={BANNER_ID} />);

      await user.hover(row());

      expect(movingBanner()).toBeNull();
      expect(backdrop()?.querySelector('[data-banner-still]')).toBeInTheDocument();
    });
  });
});
