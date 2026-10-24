import {
  AVATAR_MAX_BYTES,
  type ProfileDto,
  type UpdateProfileRequestDto,
} from '@lorkarium/contracts';
import type { AssetStoragePort, StoredObject } from '../assets/asset-storage.port';
import type { FetchRefusal, ImageFetcherPort } from '../assets/image-fetcher.port';
import type { AvatarProcessorPort } from './avatar-processor.port';
import type { ProfileChangedPort } from './profile-changed.port';
import type { ProfileRow, ProfilesDao } from './profiles.dao';
import {
  AvatarLinkBlockedError,
  AvatarLinkNotImageError,
  AvatarLinkUnreachableError,
  AvatarNotFoundError,
  AvatarTooLargeError,
  UnsupportedAvatarError,
  type ProfileError,
} from './profiles.error';
import {
  AVATAR_CONTENT_TYPE,
  avatarKeyOf,
  toProfileChanges,
  toProfileDto,
} from './profiles.mapper';

export type ProfilesServiceDeps = Readonly<{
  profiles: Pick<ProfilesDao, 'findById' | 'update' | 'swapAvatar' | 'isCurrentAvatar'>;
  storage: Pick<AssetStoragePort, 'put' | 'open' | 'remove'>;
  processor: AvatarProcessorPort;
  profileChanged: ProfileChangedPort;
  /** Downloads a photo link without reaching an internal address (the assets' guarded fetcher). */
  fetcher: ImageFetcherPort;
  newId: () => string;
}>;

/** The person's own profile: read it, change nickname, color and bio, send or take off the photo,
 *  and serve a photo by id. Every change is saved before the live tables are told.
 *
 *  Example: `await profiles.update(userOf(request).id, { color: 'rose' })` */
export class ProfilesService {
  constructor(private readonly deps: ProfilesServiceDeps) {}

  async profileOf(userId: string): Promise<ProfileDto> {
    return toProfileDto(await this.rowOf(userId));
  }

  async update(userId: string, dto: UpdateProfileRequestDto): Promise<ProfileDto> {
    const row = await this.deps.profiles.update(userId, toProfileChanges(dto));
    if (!row) throw missingAccount(userId);
    await this.deps.profileChanged.profileChanged(userId);
    return toProfileDto(row);
  }

  /** Normalizes the photo, stores it under a new id, points the account at it and only then
   *  deletes the old object: a failure halfway leaves the old photo working.
   *
   *  Example: `await profiles.replaceAvatar(user.id, new Uint8Array(request.body))` */
  async replaceAvatar(userId: string, bytes: Uint8Array): Promise<ProfileDto> {
    return this.keepAvatar(userId, bytes, (detail) => new UnsupportedAvatarError(detail));
  }

  /** The photo from a web link (an animated GIF stays animated): downloaded by the guarded
   *  fetcher, then the very path of a sent photo.
   *
   *  Example: `await profiles.replaceAvatarFromLink(user.id, 'https://media.example.com/a.gif')` */
  async replaceAvatarFromLink(userId: string, url: string): Promise<ProfileDto> {
    const fetched = await this.deps.fetcher.fetch(url);
    if (!fetched.ok) throw linkErrorOf(url, fetched.refusal);
    const notImage = (detail: string): ProfileError => new AvatarLinkNotImageError(url, detail);
    return this.keepAvatar(userId, fetched.image.bytes, notImage);
  }

  private async keepAvatar(
    userId: string,
    bytes: Uint8Array,
    refused: (detail: string) => ProfileError,
  ): Promise<ProfileDto> {
    if (bytes.byteLength > AVATAR_MAX_BYTES) {
      throw new AvatarTooLargeError(AVATAR_MAX_BYTES, bytes.byteLength);
    }
    const outcome = await this.deps.processor.normalize(bytes);
    if (!outcome.ok) throw refused(outcome.refusal.detail);
    const avatarId = this.deps.newId();
    await this.deps.storage.put(avatarKeyOf(avatarId), outcome.avatar.bytes, AVATAR_CONTENT_TYPE);
    return this.pointAt(userId, avatarId);
  }

  /** Takes the photo off; without one, nothing is written nor deleted (idempotent). */
  async removeAvatar(userId: string): Promise<ProfileDto> {
    const current = await this.rowOf(userId);
    if (current.avatarId === null) return toProfileDto(current);
    return this.pointAt(userId, null);
  }

  /** The bytes of a current photo; a replaced, removed or unknown id is AVATAR_NOT_FOUND. */
  async openAvatar(avatarId: string): Promise<StoredObject> {
    if (!(await this.deps.profiles.isCurrentAvatar(avatarId))) {
      throw new AvatarNotFoundError(avatarId);
    }
    const stored = await this.deps.storage.open(avatarKeyOf(avatarId));
    if (!stored) throw new AvatarNotFoundError(avatarId);
    return stored;
  }

  private async pointAt(userId: string, avatarId: string | null): Promise<ProfileDto> {
    const swapped = await this.deps.profiles.swapAvatar(userId, avatarId);
    if (!swapped) throw missingAccount(userId);
    await this.deps.profileChanged.profileChanged(userId);
    const { previousAvatarId } = swapped;
    if (previousAvatarId !== null && previousAvatarId !== avatarId) {
      await this.deps.storage.remove(avatarKeyOf(previousAvatarId));
    }
    return this.profileOf(userId);
  }

  private async rowOf(userId: string): Promise<ProfileRow> {
    const row = await this.deps.profiles.findById(userId);
    if (!row) throw missingAccount(userId);
    return row;
  }
}

function linkErrorOf(url: string, refusal: FetchRefusal): ProfileError {
  if (refusal.kind === 'blocked') return new AvatarLinkBlockedError(refusal.host, refusal.address);
  if (refusal.kind === 'too-large') return new AvatarTooLargeError(refusal.limit, refusal.received);
  return new AvatarLinkUnreachableError(url, refusal.reason);
}

// The guard already proved the session: an account gone between the two is a bug, not a refusal.
function missingAccount(userId: string): Error {
  return new Error(`account ${userId} passed the auth guard but has no users row`);
}
