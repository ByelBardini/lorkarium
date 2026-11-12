import type { AssetDto, AssetPurposeDto } from '@lorkarium/contracts';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useImageSender } from '@/components/use-image-sender';
import { AssetsApiFake, LYRA_PORTRAIT } from '../support/assets-api-fake';
import { VHARN } from '../support/campaigns-api-fake';
import { CENTER_STRIP } from '../support/crop-area-fake';

function senderWith(
  assets: AssetsApiFake,
  sent: AssetDto[],
  purpose: AssetPurposeDto = 'background',
) {
  return renderHook(() =>
    useImageSender({
      campaignId: VHARN.id,
      purpose,
      assets,
      onSent: (asset) => sent.push(asset),
    }),
  );
}

describe('useImageSender', () => {
  let assets: AssetsApiFake;
  let sent: AssetDto[];

  beforeEach(() => {
    assets = new AssetsApiFake();
    sent = [];
  });

  it('a PNG is uploaded with the purpose and the asset kept goes to onSent', async () => {
    const { result } = senderWith(assets, sent);
    const png = new File([new Uint8Array(8)], 'map', { type: 'image/png' });

    await act(async () => result.current.sendFile(png));

    expect(assets.sent).toEqual([
      { kind: 'upload', campaignId: VHARN.id, file: png, purpose: 'background' },
    ]);
    expect(sent).toEqual([LYRA_PORTRAIT]);
  });

  it('a GIF is refused before sending, with the problem told', async () => {
    const { result } = senderWith(assets, sent);

    act(() => result.current.sendFile(new File([], 'a', { type: 'image/gif' })));

    expect(result.current.problem).toBe('Use PNG, JPEG ou WebP.');
    expect(assets.sent).toEqual([]);
  });

  it('a link kept answers true; the link is trimmed', async () => {
    const { result } = senderWith(assets, sent);
    let kept = false;

    await act(async () => {
      kept = await result.current.sendLink('  https://x.com/map.png ');
    });

    expect(kept).toBe(true);
    expect(assets.sent).toEqual([
      { kind: 'link', campaignId: VHARN.id, url: 'https://x.com/map.png', purpose: 'background' },
    ]);
  });

  it('a refused link answers false with the reason as the problem, and onSent is not called', async () => {
    assets.answerWith({ ok: false, failure: { kind: 'link_blocked' } });
    const { result } = senderWith(assets, sent);
    let kept = true;

    await act(async () => {
      kept = await result.current.sendLink('https://x.com/a');
    });

    expect(kept).toBe(false);
    expect(result.current.problem).toBe('Esse link não pode ser usado.');
    expect(sent).toEqual([]);
  });

  it('an empty link sends nothing and answers false', async () => {
    const { result } = senderWith(assets, sent);
    let kept = true;

    await act(async () => {
      kept = await result.current.sendLink('   ');
    });

    expect(kept).toBe(false);
    expect(assets.sent).toEqual([]);
  });

  it('is busy while sending, and not after', async () => {
    assets.hold();
    const { result } = senderWith(assets, sent);

    act(() => result.current.sendFile(new File([], 'a', { type: 'image/png' })));
    expect(result.current.busy).toBe(true);
    await act(async () => assets.release());

    expect(result.current.busy).toBe(false);
  });

  describe('a campaign image is framed before it goes', () => {
    const photo = new File([new Uint8Array(8)], 'lork', { type: 'image/png' });

    it('a file for the photo opens the crop with that file, and nothing is sent', () => {
      const { result } = senderWith(assets, sent, 'campaign_photo');

      act(() => result.current.sendFile(photo));

      expect(result.current.cropping).toEqual({ file: photo, purpose: 'campaign_photo' });
      expect(assets.sent).toEqual([]);
    });

    it('confirming the crop uploads the file with the rectangle and closes the crop', async () => {
      const { result } = senderWith(assets, sent, 'campaign_banner');
      act(() => result.current.sendFile(photo));

      await act(async () => result.current.confirmCrop(CENTER_STRIP));

      expect(assets.sent).toEqual([
        {
          kind: 'upload',
          campaignId: VHARN.id,
          file: photo,
          purpose: 'campaign_banner',
          crop: CENTER_STRIP,
        },
      ]);
      expect(result.current.cropping).toBeNull();
      expect(sent).toEqual([LYRA_PORTRAIT]);
    });

    it('cancelling the crop closes it and sends nothing', () => {
      const { result } = senderWith(assets, sent, 'cover');
      act(() => result.current.sendFile(photo));

      act(() => result.current.cancelCrop());

      expect(result.current.cropping).toBeNull();
      expect(assets.sent).toEqual([]);
    });

    it('a GIF for the photo is refused before the crop opens', () => {
      const { result } = senderWith(assets, sent, 'campaign_photo');

      act(() => result.current.sendFile(new File([], 'a', { type: 'image/gif' })));

      expect(result.current.problem).toBe('Use PNG, JPEG ou WebP.');
      expect(result.current.cropping).toBeNull();
    });

    it('a token file has no frame and goes straight, as before', async () => {
      const { result } = senderWith(assets, sent, 'token');

      await act(async () => result.current.sendFile(photo));

      expect(result.current.cropping).toBeNull();
      expect(assets.sent).toEqual([
        { kind: 'upload', campaignId: VHARN.id, file: photo, purpose: 'token' },
      ]);
    });

    it('a link for the photo goes without a rectangle (the server frames the center)', async () => {
      const { result } = senderWith(assets, sent, 'campaign_photo');

      await act(async () => {
        await result.current.sendLink('https://x.com/lork.png');
      });

      expect(result.current.cropping).toBeNull();
      expect(assets.sent).toEqual([
        {
          kind: 'link',
          campaignId: VHARN.id,
          url: 'https://x.com/lork.png',
          purpose: 'campaign_photo',
        },
      ]);
    });
  });
});
