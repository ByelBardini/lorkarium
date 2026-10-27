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
