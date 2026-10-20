import type { AssetDto } from '@lorkarium/contracts';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useImageSender } from '@/components/use-image-sender';
import { AssetsApiFake, LYRA_PORTRAIT } from '../support/assets-api-fake';
import { VHARN } from '../support/campaigns-api-fake';

function senderWith(assets: AssetsApiFake, sent: AssetDto[]) {
  return renderHook(() =>
    useImageSender({
      campaignId: VHARN.id,
      purpose: 'background',
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
});
