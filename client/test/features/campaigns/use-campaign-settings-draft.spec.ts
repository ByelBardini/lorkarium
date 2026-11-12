import { act, renderHook } from '@testing-library/react';
import type { CampaignDetailDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { useCampaignSettingsDraft } from '@/features/campaigns/use-campaign-settings-draft';
import { detailOf, VHARN } from '../../support/campaigns-api-fake';

function draftOf(overrides: Partial<CampaignDetailDto> = {}) {
  return renderHook(() => useCampaignSettingsDraft(detailOf(VHARN, overrides)));
}

describe('useCampaignSettingsDraft · player token rights', () => {
  it('starts at the confirmed rights, clean', () => {
    const { result } = draftOf({ playersCreateTokens: true, playersDeleteTokens: false });
    expect(result.current.values.playersCreateTokens).toBe(true);
    expect(result.current.values.playersDeleteTokens).toBe(false);
    expect(result.current.dirty).toBe(false);
  });

  it('switching on only "create" puts only that key in the PATCH', () => {
    const { result } = draftOf();
    act(() => result.current.change({ playersCreateTokens: true }));
    expect(result.current.dirty).toBe(true);
    expect(result.current.update).toEqual({ playersCreateTokens: true });
  });

  it('switching off a confirmed "delete" sends false, not an empty PATCH', () => {
    const { result } = draftOf({ playersDeleteTokens: true });
    act(() => result.current.change({ playersDeleteTokens: false }));
    expect(result.current.update).toEqual({ playersDeleteTokens: false });
  });

  it('back to the confirmed value: clean again and nothing to send', () => {
    const { result } = draftOf();
    act(() => result.current.change({ playersCreateTokens: true }));
    act(() => result.current.change({ playersCreateTokens: false }));
    expect(result.current.dirty).toBe(false);
    expect(result.current.update).toBeNull();
  });
});

describe('useCampaignSettingsDraft · photo and banner', () => {
  const PHOTO_ID = '1b2c3d4e-5f60-4a71-8b92-a3b4c5d6e7f8';
  const BANNER_ID = '9e8d7c6b-5a49-4382-9716-05f4e3d2c1b0';

  it('starts at the confirmed photo and banner, clean', () => {
    const { result } = draftOf({ photoAssetId: PHOTO_ID, bannerAssetId: null });
    expect(result.current.values.photoAssetId).toBe(PHOTO_ID);
    expect(result.current.values.bannerAssetId).toBeNull();
    expect(result.current.dirty).toBe(false);
    expect(result.current.update).toBeNull();
  });

  it('a new photo goes in the PATCH as photoAssetId', () => {
    const { result } = draftOf();
    act(() => result.current.change({ photoAssetId: PHOTO_ID }));
    expect(result.current.update).toEqual({ photoAssetId: PHOTO_ID });
  });

  it('"Usar a capa" on a confirmed banner sends bannerAssetId null', () => {
    const { result } = draftOf({ bannerAssetId: BANNER_ID });
    act(() => result.current.change({ bannerAssetId: null }));
    expect(result.current.update).toEqual({ bannerAssetId: null });
  });

  it('the same photo chosen again: clean, nothing to save', () => {
    const { result } = draftOf({ photoAssetId: PHOTO_ID });
    act(() => result.current.change({ photoAssetId: PHOTO_ID }));
    expect(result.current.dirty).toBe(false);
    expect(result.current.update).toBeNull();
  });
});
