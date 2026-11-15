import { act, renderHook } from '@testing-library/react';
import { PROFILE_CONTACT_MAX_LENGTH } from '@lorkarium/contracts';
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

describe('useProfileDraft: the game preferences', () => {
  it('systems, schedule and contact start from the profile, empty for null', () => {
    const profile = { ...ANA_PROFILE, gameSystems: 'D&D 5e', playSchedule: null, contact: null };
    const { result } = renderHook(() => useProfileDraft(profile));

    expect(result.current.values).toMatchObject({
      gameSystems: 'D&D 5e',
      playSchedule: '',
      contact: '',
    });
    expect(result.current.dirty).toBe(false);
  });

  it('only the preference that changed goes in the PATCH, an emptied one as null', () => {
    const profile = { ...ANA_PROFILE, gameSystems: 'D&D 5e' };
    const { result } = renderHook(() => useProfileDraft(profile));

    act(() => result.current.change({ gameSystems: '', playSchedule: 'Sábado à noite' }));

    expect(result.current.update).toEqual({ gameSystems: null, playSchedule: 'Sábado à noite' });
  });

  it('a contact past the ceiling is an inline error and nothing is sent', () => {
    const { result } = renderHook(() => useProfileDraft(ANA_PROFILE));

    act(() => result.current.change({ contact: 'x'.repeat(PROFILE_CONTACT_MAX_LENGTH + 1) }));

    expect(result.current.errors.contact).toBe(
      `Use no máximo ${PROFILE_CONTACT_MAX_LENGTH} caracteres.`,
    );
    expect(result.current.errors.gameSystems).toBeUndefined();
    expect(result.current.update).toBeNull();
  });
});
