import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useProfileDraft } from '@/features/account/use-profile-draft';
import { ANA_PROFILE } from '../../support/profile-api-fake';

const CUSTOM_PROFILE = { ...ANA_PROFILE, color: '#336699', colorChoice: '#336699' } as const;

describe('useProfileDraft: the color', () => {
  it('a custom color choice comes back as the color of the draft, with nothing to save', () => {
    const { result } = renderHook(() => useProfileDraft(CUSTOM_PROFILE));

    expect(result.current.values.color).toBe('#336699');
    expect(result.current.dirty).toBe(false);
    expect(result.current.update).toBeNull();
  });

  it('picking again the custom color already confirmed marks no change', () => {
    const { result } = renderHook(() => useProfileDraft(CUSTOM_PROFILE));

    act(() => result.current.change({ color: '#336699' }));

    expect(result.current.dirty).toBe(false);
  });

  it('another custom color is what the save sends', () => {
    const { result } = renderHook(() => useProfileDraft(CUSTOM_PROFILE));

    act(() => result.current.change({ color: '#aabbcc' }));

    expect(result.current.update).toEqual({ color: '#aabbcc' });
  });

  it('a custom color over a name of the palette is sent as the hex', () => {
    const { result } = renderHook(() => useProfileDraft(ANA_PROFILE));

    act(() => result.current.change({ color: '#336699' }));

    expect(result.current.values.color).toBe('#336699');
    expect(result.current.update).toEqual({ color: '#336699' });
  });

  it('a name of the palette over a custom color is sent as the name', () => {
    const { result } = renderHook(() => useProfileDraft(CUSTOM_PROFILE));

    act(() => result.current.change({ color: 'rose' }));

    expect(result.current.update).toEqual({ color: 'rose' });
  });
});

describe('useProfileDraft: changed', () => {
  it('names each field that differs, an invalid one included, in a fixed order', () => {
    const { result } = renderHook(() => useProfileDraft(ANA_PROFILE));

    act(() => result.current.change({ diceNumberColor: '#ff3366', name: '' }));

    expect(result.current.changed).toEqual(['name', 'diceNumberColor']);
    expect(result.current.update).toBeNull();
  });

  it('is empty again after discarding', () => {
    const { result } = renderHook(() => useProfileDraft(ANA_PROFILE));

    act(() => result.current.change({ bio: 'Druida.' }));
    act(() => result.current.discard());

    expect(result.current.changed).toEqual([]);
  });
});
