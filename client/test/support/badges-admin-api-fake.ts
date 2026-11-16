import type {
  AdminBadgeDto,
  BadgeDto,
  CreateBadgeRequestDto,
  UpdateBadgeRequestDto,
} from '@lorkarium/contracts';
import type { ImageCropRect } from '@/services/assets-api';
import type { BadgesAdminApi, BadgesAdminResult } from '@/services/badges-admin-api';
import { ScriptedAnswers } from './scripted-answers';

type Answers = {
  catalog: BadgesAdminResult<AdminBadgeDto[]>;
  create: BadgesAdminResult<AdminBadgeDto>;
  update: BadgesAdminResult<AdminBadgeDto>;
  uploadImage: BadgesAdminResult<AdminBadgeDto>;
  reorder: BadgesAdminResult<AdminBadgeDto[]>;
  remove: BadgesAdminResult<null>;
  grantsOf: BadgesAdminResult<string[]>;
  grant: BadgesAdminResult<BadgeDto[]>;
};

/** "Veterano", with image, held by 12 accounts. */
export const VETERAN_BADGE: AdminBadgeDto = {
  id: '7d0c1f5e-2b3a-4c4d-8e5f-6a7b8c9d0e1f',
  name: 'Veterano',
  description: 'Jogou 100 sessões',
  imageId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  position: 0,
  holders: 12,
};

/** "Narrador", with image, held by one account. */
export const NARRATOR_BADGE: AdminBadgeDto = {
  id: '8e1d2a6f-3c4b-4d5e-9f6a-7b8c9d0e1f2a',
  name: 'Narrador',
  description: 'Narrou a primeira mesa',
  imageId: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
  position: 1,
  holders: 1,
};

/** "Fundador", still without image (the upload failed or never happened). */
export const FOUNDER_BADGE: AdminBadgeDto = {
  id: '9f2e3b7a-4d5c-4e6f-8a7b-8c9d0e1f2a3b',
  name: 'Fundador',
  description: 'Esteve na primeira versão',
  imageId: null,
  position: 2,
  holders: 0,
};

const NEW_BADGE_ID = '0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d';
const NEW_IMAGE_ID = '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f';

/** A `BadgesAdminApi` over a catalog kept like the server (`badges`, in order) and the grants per
 *  account (`grants`); a method answers what `answers` scripts, or the fake's own state.
 *
 *  Example: `api.put(VETERAN_BADGE); api.answers.answer('create', { ok: false, failure: { kind: 'name_taken' } })` */
export class BadgesAdminApiFake implements BadgesAdminApi {
  badges: AdminBadgeDto[] = [];
  readonly grants = new Map<string, string[]>();
  readonly answers = new ScriptedAnswers<Answers>();
  /** The rectangles each upload carried, in order. */
  readonly uploads: Array<Readonly<{ badgeId: string; file: Blob; crop: ImageCropRect }>> = [];

  put(...badges: AdminBadgeDto[]): this {
    this.badges.push(...badges);
    return this;
  }

  catalog(): Promise<Answers['catalog']> {
    return this.answers.reply('catalog', null, () => ({ ok: true, value: [...this.badges] }));
  }

  create(input: CreateBadgeRequestDto): Promise<Answers['create']> {
    return this.answers.reply('create', input, () => {
      const position = this.badges.length;
      const badge = { id: NEW_BADGE_ID, ...input, imageId: null, position, holders: 0 };
      this.badges.push(badge);
      return { ok: true, value: badge };
    });
  }

  update(badgeId: string, input: UpdateBadgeRequestDto): Promise<Answers['update']> {
    return this.answers.reply('update', { badgeId, ...input }, () => this.replace(badgeId, input));
  }

  uploadImage(badgeId: string, file: Blob, crop: ImageCropRect): Promise<Answers['uploadImage']> {
    this.uploads.push({ badgeId, file, crop });
    return this.answers.reply('uploadImage', { badgeId, crop }, () =>
      this.replace(badgeId, { imageId: NEW_IMAGE_ID }),
    );
  }

  reorder(badgeIds: readonly string[]): Promise<Answers['reorder']> {
    return this.answers.reply('reorder', [...badgeIds], () => {
      const byId = new Map(this.badges.map((badge) => [badge.id, badge]));
      this.badges = badgeIds.flatMap((id, position) => {
        const badge = byId.get(id);
        return badge ? [{ ...badge, position }] : [];
      });
      return { ok: true, value: [...this.badges] };
    });
  }

  remove(badgeId: string): Promise<Answers['remove']> {
    return this.answers.reply('remove', badgeId, () => {
      this.badges = this.badges.filter((badge) => badge.id !== badgeId);
      return { ok: true, value: null };
    });
  }

  grantsOf(userId: string): Promise<Answers['grantsOf']> {
    return this.answers.reply('grantsOf', userId, () => ({
      ok: true,
      value: [...(this.grants.get(userId) ?? [])],
    }));
  }

  grant(userId: string, badgeIds: readonly string[]): Promise<Answers['grant']> {
    return this.answers.reply('grant', { userId, badgeIds: [...badgeIds] }, () => {
      this.grants.set(userId, [...badgeIds]);
      return { ok: true, value: this.cardBadgesOf(badgeIds) };
    });
  }

  private replace(badgeId: string, change: Partial<AdminBadgeDto>): Answers['update'] {
    const index = this.badges.findIndex((badge) => badge.id === badgeId);
    const current = this.badges[index];
    if (!current) return { ok: false, failure: { kind: 'not_found' } };
    const next = { ...current, ...change };
    this.badges[index] = next;
    return { ok: true, value: next };
  }

  private cardBadgesOf(badgeIds: readonly string[]): BadgeDto[] {
    return this.badges.flatMap(({ id, name, description, imageId }) =>
      imageId !== null && badgeIds.includes(id) ? [{ id, name, description, imageId }] : [],
    );
  }
}
