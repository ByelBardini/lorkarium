import {
  AVATAR_MAX_BYTES,
  AVATAR_SIDE,
  DICE_TEXTURE_SIDE,
  type ProfileDto,
  type UpdateProfileRequestDto,
} from '@lorkarium/contracts';
import type { AssetStoragePort, StoredObject } from '../assets/asset-storage.port';
import type { FetchRefusal, ImageFetcherPort } from '../assets/image-fetcher.port';
import type { AvatarProcessorPort, ImageShape } from './avatar-processor.port';
import type { ProfileChangedPort } from './profile-changed.port';
import type { ProfileChanges, ProfileRow, ProfilesDao, SwappedImage } from './profiles.dao';
import {
  AvatarLinkBlockedError,
  AvatarLinkNotImageError,
  AvatarLinkUnreachableError,
  AvatarNotFoundError,
  AvatarTooLargeError,
  DiceTextureNotFoundError,
  DiceTextureTooLargeError,
  UnsupportedAvatarError,
  type ProfileError,
  type ProfileImageSubject,
} from './profiles.error';
import {
  AVATAR_CONTENT_TYPE,
  avatarKeyOf,
  diceTextureKeyOf,
  toProfileChanges,
  toProfileDto,
} from './profiles.mapper';

export type ProfilesServiceDeps = Readonly<{
  profiles: Pick<
    ProfilesDao,
    | 'findById'
    | 'update'
    | 'swapAvatar'
    | 'isCurrentAvatar'
    | 'swapDiceTexture'
    | 'isCurrentDiceTexture'
  >;
  storage: Pick<AssetStoragePort, 'put' | 'open' | 'remove'>;
  processor: AvatarProcessorPort;
  profileChanged: ProfileChangedPort;
  /** Downloads an image link without reaching an internal address (the assets' guarded fetcher). */
  fetcher: ImageFetcherPort;
  newId: () => string;
}>;

/** One image of the account (the photo, the dice texture): its column, its bucket prefix, the
 *  square it is kept as, its own refusals, and whether the live tables hear of a change. */
type ImageSpace = Readonly<{
  subject: ProfileImageSubject;
  shape: ImageShape;
  keyOf: (imageId: string) => string;
  idOf: (row: ProfileRow) => string | null;
  swap: (userId: string, imageId: string | null) => Promise<SwappedImage | undefined>;
  isCurrent: (imageId: string) => Promise<boolean>;
  notFound: (imageId: string) => ProfileError;
  tooLarge: (limit: number, received: number | null) => ProfileError;
  tellsTables: boolean;
}>;

// The roster shows nickname, color, bio and photo; the dice appearance is read at roll time.
const ROSTER_FIELDS = ['name', 'color', 'bio'] as const satisfies readonly (keyof ProfileChanges)[];

/** The person's own profile: read it, change nickname, color, bio and dice number color, send or
 *  take off the photo and the dice texture, and serve either by id. Every change is saved before
 *  the live tables are told (only of what their roster shows).
 *
 *  Example: `await profiles.update(userOf(request).id, { color: 'rose' })` */
export class ProfilesService {
  private readonly avatar: ImageSpace;
  private readonly diceTexture: ImageSpace;

  constructor(private readonly deps: ProfilesServiceDeps) {
    this.avatar = avatarSpaceOf(deps.profiles);
    this.diceTexture = diceTextureSpaceOf(deps.profiles);
  }

  async profileOf(userId: string): Promise<ProfileDto> {
    return toProfileDto(await this.rowOf(userId));
  }

  async update(userId: string, dto: UpdateProfileRequestDto): Promise<ProfileDto> {
    const changes = toProfileChanges(dto);
    const row = await this.deps.profiles.update(userId, changes);
    if (!row) throw missingAccount(userId);
    if (touchesRoster(changes)) await this.deps.profileChanged.profileChanged(userId);
    return toProfileDto(row);
  }

  /** Normalizes the photo, stores it under a new id, points the account at it and only then
   *  deletes the old object: a failure halfway leaves the old photo working.
   *
   *  Example: `await profiles.replaceAvatar(user.id, new Uint8Array(request.body))` */
  async replaceAvatar(userId: string, bytes: Uint8Array): Promise<ProfileDto> {
    return this.keepImage(
      this.avatar,
      userId,
      bytes,
      (detail) => new UnsupportedAvatarError(detail),
    );
  }

  /** The photo from a web link (an animated GIF stays animated): downloaded by the guarded
   *  fetcher, then the very path of a sent photo.
   *
   *  Example: `await profiles.replaceAvatarFromLink(user.id, 'https://media.example.com/a.gif')` */
  async replaceAvatarFromLink(userId: string, url: string): Promise<ProfileDto> {
    return this.keepImageFromLink(this.avatar, userId, url);
  }

  /** Takes the photo off; without one, nothing is written nor deleted (idempotent). */
  async removeAvatar(userId: string): Promise<ProfileDto> {
    return this.removeImage(this.avatar, userId);
  }

  /** The bytes of a current photo; a replaced, removed or unknown id is AVATAR_NOT_FOUND. */
  async openAvatar(avatarId: string): Promise<StoredObject> {
    return this.openImage(this.avatar, avatarId);
  }

  /** The photo's path for the dice texture: a still 512 square under `dice-textures/`, and no
   *  live table is told (the roster does not show it).
   *
   *  Example: `await profiles.replaceDiceTexture(user.id, new Uint8Array(request.body))` */
  async replaceDiceTexture(userId: string, bytes: Uint8Array): Promise<ProfileDto> {
    const unsupported = (detail: string): ProfileError => new UnsupportedAvatarError(detail);
    return this.keepImage(this.diceTexture, userId, bytes, unsupported);
  }

  /** The dice texture from a web link (a GIF keeps only its first frame).
   *
   *  Example: `await profiles.replaceDiceTextureFromLink(user.id, 'https://x.com/t.png')` */
  async replaceDiceTextureFromLink(userId: string, url: string): Promise<ProfileDto> {
    return this.keepImageFromLink(this.diceTexture, userId, url);
  }

  /** Takes the dice texture off (back to the profile color); idempotent. */
  async removeDiceTexture(userId: string): Promise<ProfileDto> {
    return this.removeImage(this.diceTexture, userId);
  }

  /** The bytes of a current dice texture; anything else is DICE_TEXTURE_NOT_FOUND. */
  async openDiceTexture(diceTextureId: string): Promise<StoredObject> {
    return this.openImage(this.diceTexture, diceTextureId);
  }

  private async keepImageFromLink(
    space: ImageSpace,
    userId: string,
    url: string,
  ): Promise<ProfileDto> {
    const fetched = await this.deps.fetcher.fetch(url);
    if (!fetched.ok) throw linkErrorOf(space, url, fetched.refusal);
    const notImage = (detail: string): ProfileError =>
      new AvatarLinkNotImageError(url, detail, space.subject);
    return this.keepImage(space, userId, fetched.image.bytes, notImage);
  }

  private async keepImage(
    space: ImageSpace,
    userId: string,
    bytes: Uint8Array,
    refused: (detail: string) => ProfileError,
  ): Promise<ProfileDto> {
    if (bytes.byteLength > AVATAR_MAX_BYTES)
      throw space.tooLarge(AVATAR_MAX_BYTES, bytes.byteLength);
    const outcome = await this.deps.processor.normalize(bytes, space.shape);
    if (!outcome.ok) throw refused(outcome.refusal.detail);
    const imageId = this.deps.newId();
    await this.deps.storage.put(space.keyOf(imageId), outcome.avatar.bytes, AVATAR_CONTENT_TYPE);
    return this.pointAt(space, userId, imageId);
  }

  private async removeImage(space: ImageSpace, userId: string): Promise<ProfileDto> {
    const current = await this.rowOf(userId);
    if (space.idOf(current) === null) return toProfileDto(current);
    return this.pointAt(space, userId, null);
  }

  private async openImage(space: ImageSpace, imageId: string): Promise<StoredObject> {
    if (!(await space.isCurrent(imageId))) throw space.notFound(imageId);
    const stored = await this.deps.storage.open(space.keyOf(imageId));
    if (!stored) throw space.notFound(imageId);
    return stored;
  }

  private async pointAt(
    space: ImageSpace,
    userId: string,
    imageId: string | null,
  ): Promise<ProfileDto> {
    const swapped = await space.swap(userId, imageId);
    if (!swapped) throw missingAccount(userId);
    if (space.tellsTables) await this.deps.profileChanged.profileChanged(userId);
    const { previousId } = swapped;
    if (previousId !== null && previousId !== imageId) {
      await this.deps.storage.remove(space.keyOf(previousId));
    }
    return this.profileOf(userId);
  }

  private async rowOf(userId: string): Promise<ProfileRow> {
    const row = await this.deps.profiles.findById(userId);
    if (!row) throw missingAccount(userId);
    return row;
  }
}

type ImageColumns = ProfilesServiceDeps['profiles'];

function avatarSpaceOf(profiles: ImageColumns): ImageSpace {
  return {
    subject: 'photo',
    shape: { side: AVATAR_SIDE, animated: true },
    keyOf: avatarKeyOf,
    idOf: (row) => row.avatarId,
    swap: (userId, imageId) => profiles.swapAvatar(userId, imageId),
    isCurrent: (imageId) => profiles.isCurrentAvatar(imageId),
    notFound: (imageId) => new AvatarNotFoundError(imageId),
    tooLarge: (limit, received) => new AvatarTooLargeError(limit, received),
    tellsTables: true,
  };
}

function diceTextureSpaceOf(profiles: ImageColumns): ImageSpace {
  return {
    subject: 'dice texture',
    shape: { side: DICE_TEXTURE_SIDE, animated: false },
    keyOf: diceTextureKeyOf,
    idOf: (row) => row.diceTextureId,
    swap: (userId, imageId) => profiles.swapDiceTexture(userId, imageId),
    isCurrent: (imageId) => profiles.isCurrentDiceTexture(imageId),
    notFound: (imageId) => new DiceTextureNotFoundError(imageId),
    tooLarge: (limit, received) => new DiceTextureTooLargeError(limit, received),
    tellsTables: false,
  };
}

function touchesRoster(changes: ProfileChanges): boolean {
  return ROSTER_FIELDS.some((field) => field in changes);
}

function linkErrorOf(space: ImageSpace, url: string, refusal: FetchRefusal): ProfileError {
  if (refusal.kind === 'blocked') {
    return new AvatarLinkBlockedError(refusal.host, refusal.address, space.subject);
  }
  if (refusal.kind === 'too-large') return space.tooLarge(refusal.limit, refusal.received);
  return new AvatarLinkUnreachableError(url, refusal.reason, space.subject);
}

// The guard already proved the session: an account gone between the two is a bug, not a refusal.
function missingAccount(userId: string): Error {
  return new Error(`account ${userId} passed the auth guard but has no users row`);
}
