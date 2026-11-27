import { savedTokenBodyDto, type SavedTokenDto } from '@lorkarium/contracts';

export const ZOMBIE_ID = '3c5e7a91-2b4d-4f6a-8c0e-1d3f5a7b9c2e';
export const SKELETON_ID = '5e7a9c13-4d6f-4b8c-9e2a-3f5b7d9e1a4c';
export const MORTOS_ID = '4d6f8b02-3c5e-4a7b-9d1f-2e4a6b8c0d3f';

/** Bia's saved "Zumbi": 1×1 enemy with PV 12 and a green aura.
 *
 *  Example: `zombieSaved({ planLocked: true })` */
export function zombieSaved(overrides: Partial<SavedTokenDto> = {}): SavedTokenDto {
  return {
    id: ZOMBIE_ID,
    name: 'Zumbi',
    folderId: null,
    planLocked: false,
    token: savedTokenBodyDto.parse({
      name: 'Zumbi',
      initials: 'ZB',
      side: 'enemy',
      width: 1,
      height: 1,
      aura: { kind: 'color', radius: 1, opacity: 60, color: '#22aa44' },
      bars: [{ label: 'PV', current: 12, max: 12, color: '#cc2222', visibility: 'everyone' }],
    }),
    ...overrides,
  };
}

/** Bia's saved "Esqueleto" in the folder "Mortos-vivos".
 *
 *  Example: `skeletonSaved()` */
export function skeletonSaved(overrides: Partial<SavedTokenDto> = {}): SavedTokenDto {
  const base = zombieSaved();
  return {
    ...base,
    id: SKELETON_ID,
    name: 'Esqueleto',
    folderId: MORTOS_ID,
    token: { ...base.token, name: 'Esqueleto', initials: 'ES' },
    ...overrides,
  };
}
