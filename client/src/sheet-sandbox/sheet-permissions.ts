import type { SheetFrameRequestDto, SheetManifestPermissionDto } from '@lorkarium/contracts';

type RequestType = SheetFrameRequestDto['type'];

// Values, bars and dice came before the manifest: every sheet keeps them, declared or not.
const PERMISSION_BY_REQUEST: Readonly<Partial<Record<RequestType, SheetManifestPermissionDto>>> = {
  'character.set': 'character:stats',
  'character.setImage': 'character:portrait',
  'assets.upload': 'sheet:images',
  'assets.read': 'sheet:images',
};

/** The manifest permission a request needs, or `null` for one every sheet has.
 *
 *  Example: `permissionOf('character.set') // 'character:stats'` */
export function permissionOf(type: RequestType): SheetManifestPermissionDto | null {
  return PERMISSION_BY_REQUEST[type] ?? null;
}

export type SheetPermissionRefusal = Readonly<{ code: 'PERMISSION_NOT_DECLARED'; message: string }>;

/** Refuses a request whose permission the template's manifest does not declare; `null` lets it
 *  through (the viewer's own rights are checked after, by the host and the server).
 *
 *  Example: `permissionRefusalOf('assets.upload', template.manifest.permissions)` */
export function permissionRefusalOf(
  type: RequestType,
  declared: readonly SheetManifestPermissionDto[],
): SheetPermissionRefusal | null {
  const needed = permissionOf(type);
  if (needed === null || declared.includes(needed)) return null;
  return {
    code: 'PERMISSION_NOT_DECLARED',
    message: `${type} needs permission ${needed} in the manifest`,
  };
}
