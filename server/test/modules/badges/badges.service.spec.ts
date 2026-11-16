import { BADGE_IMAGE_MAX_BYTES } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  BadgeAccountNotFoundError,
  BadgeImageNotFoundError,
  BadgeImageTooLargeError,
  BadgeNameTakenError,
  BadgeNotFoundError,
  BadgeOrderStaleError,
  BadgeWithoutImageError,
  UnsupportedBadgeImageError,
} from '../../../src/modules/badges/badges.error';
import { BadgesService } from '../../../src/modules/badges/badges.service';
import { AssetStorageFake } from '../../support/assets-fakes';
import {
  BadgeAccountsFake,
  BadgesDaoFake,
  badgesTransactionOver,
} from '../../support/badges-fakes';
import { AvatarProcessorFake } from '../../support/profiles-fakes';

const BIA_ID = '3f0c9a8e-1b2d-4e5f-8a6b-7c8d9e0f1a2b';
const CROP = { x: 10, y: 0, w: 50, h: 50 };
const PNG = Uint8Array.from([1, 2, 3]);

describe('BadgesService', () => {
  let journal: string[];
  let badges: BadgesDaoFake;
  let storage: AssetStorageFake;
  let processor: AvatarProcessorFake;
  let service: BadgesService;
  let ids: string[];

  beforeEach(() => {
    journal = [];
    badges = new BadgesDaoFake(journal);
    storage = new AssetStorageFake(journal);
    processor = new AvatarProcessorFake(journal);
    ids = ['img-1', 'img-2', 'img-3'];
    const accounts = new BadgeAccountsFake([BIA_ID]);
    service = new BadgesService({
      badges,
      accounts,
      transaction: badgesTransactionOver({ badges, accounts }, journal),
      storage,
      processor,
      newId: () => ids.shift() ?? 'img-x',
    });
  });

  async function created(name: string, withImage = true): Promise<string> {
    const { id } = await service.create({ name, description: `${name}!` });
    if (withImage) await service.uploadImage(id, PNG, null);
    return id;
  }

  it('create puts the badge last, without an image and with nobody holding it', async () => {
    await created('Veterano', false);

    const badge = await service.create({ name: 'Mestre', description: 'Mestrou' });

    expect(badge).toMatchObject({ name: 'Mestre', imageId: null, position: 1, holders: 0 });
  });

  it('a name another badge has in another case is BADGE_NAME_TAKEN citing it', async () => {
    await created('veterano', false);

    const refused = service.create({ name: 'Veterano', description: 'x' });

    await expect(refused).rejects.toThrow(BadgeNameTakenError);
    await expect(service.create({ name: 'VETERANO', description: 'x' })).rejects.toThrow(
      '"VETERANO"',
    );
  });

  it('update renames, and renaming to a taken name is BADGE_NAME_TAKEN', async () => {
    const id = await created('Veterano', false);
    await created('Mestre', false);

    expect((await service.update(id, { name: 'Lenda' })).name).toBe('Lenda');
    await expect(service.update(id, { name: 'mestre' })).rejects.toThrow(BadgeNameTakenError);
  });

  it('update of an unknown badge is BADGE_NOT_FOUND', async () => {
    await expect(service.update('nope', { description: 'x' })).rejects.toThrow(BadgeNotFoundError);
  });

  it('uploadImage asks a still 128 square inside the crop and stores under a new id', async () => {
    const id = await created('Veterano', false);

    const badge = await service.uploadImage(id, PNG, CROP);

    expect(processor.shapes).toEqual([{ width: 128, height: 128, animated: false, crop: CROP }]);
    expect(badge.imageId).toBe('img-1');
    expect(storage.objects.get('badges/img-1')?.contentType).toBe('image/webp');
  });

  it('replacing the image stores the new one before the swap and removes the old after', async () => {
    const id = await created('Veterano');
    journal.length = 0;

    await service.uploadImage(id, PNG, null);

    expect(journal).toEqual(['normalize', 'put', `swap:${id}`, 'remove:badges/img-1']);
  });

  it('bytes above 2 MiB are BADGE_IMAGE_TOO_LARGE before anything is decoded', async () => {
    const id = await created('Veterano', false);
    const big = new Uint8Array(BADGE_IMAGE_MAX_BYTES + 1);

    await expect(service.uploadImage(id, big, null)).rejects.toThrow(BadgeImageTooLargeError);
    expect(processor.shapes).toEqual([]);
  });

  it('a refusal of the processor is UNSUPPORTED_IMAGE with its words, nothing stored', async () => {
    const id = await created('Veterano', false);
    processor.refusal = { reason: 'format', detail: 'svg; expected png, jpeg, webp or gif' };

    const refused = service.uploadImage(id, PNG, null);

    await expect(refused).rejects.toThrow(UnsupportedBadgeImageError);
    await expect(service.uploadImage(id, PNG, null)).rejects.toThrow('svg; expected');
    expect(storage.objects.size).toBe(0);
  });

  it('uploadImage of an unknown badge is BADGE_NOT_FOUND before decoding', async () => {
    await expect(service.uploadImage('nope', PNG, null)).rejects.toThrow(BadgeNotFoundError);
    expect(processor.shapes).toEqual([]);
  });

  it('reorder accepts the catalog in another order, in one transaction', async () => {
    const a = await created('A', false);
    const b = await created('B', false);
    journal.length = 0;

    const reordered = await service.reorder([b, a]);

    expect(reordered.map((badge) => badge.name)).toEqual(['B', 'A']);
    expect(journal).toEqual(['reorder', 'commit']);
  });

  it('reorder with an id missing or unknown is BADGE_ORDER_STALE citing them, nothing written', async () => {
    const a = await created('A', false);
    const b = await created('B', false);
    journal.length = 0;

    const refused = service.reorder([a, 'ghost']);

    await expect(refused).rejects.toThrow(BadgeOrderStaleError);
    await expect(service.reorder([a, 'ghost'])).rejects.toThrow(`missing [${b}], unknown [ghost]`);
    expect(journal).toEqual([]);
  });

  it('delete removes the row before the image, and a badge without one never calls remove', async () => {
    const withImage = await created('A');
    const without = await created('B', false);
    journal.length = 0;

    await service.delete(withImage);
    await service.delete(without);

    expect(journal).toEqual([`delete:${withImage}`, 'remove:badges/img-1', `delete:${without}`]);
  });

  it('delete of an unknown badge is BADGE_NOT_FOUND', async () => {
    await expect(service.delete('nope')).rejects.toThrow(BadgeNotFoundError);
  });

  it('grant replaces the set and answers the badges in catalog order', async () => {
    const a = await created('A');
    const b = await created('B');
    await service.grant(BIA_ID, [a]);

    const shown = await service.grant(BIA_ID, [b, a]);

    expect(shown.map((badge) => badge.name)).toEqual(['A', 'B']);
    expect(await service.grantsOf(BIA_ID)).toEqual([a, b]);
    expect(journal.slice(-2)).toEqual([`grant:${BIA_ID}`, 'commit']);
  });

  it('granting a badge without an image is BADGE_WITHOUT_IMAGE with its id', async () => {
    const a = await created('A');
    const without = await created('B', false);

    await expect(service.grant(BIA_ID, [a, without])).rejects.toThrow(BadgeWithoutImageError);
    await expect(service.grant(BIA_ID, [a, without])).rejects.toThrow(without);
    expect(badges.grants.size).toBe(0);
  });

  it('granting an unknown badge is BADGE_NOT_FOUND', async () => {
    await expect(service.grant(BIA_ID, ['ghost'])).rejects.toThrow(BadgeNotFoundError);
  });

  it('an unknown account is USER_NOT_FOUND on grant and on grantsOf', async () => {
    await expect(service.grant('nobody', [])).rejects.toThrow(BadgeAccountNotFoundError);
    await expect(service.grantsOf('nobody')).rejects.toThrow(BadgeAccountNotFoundError);
  });

  it('badgesOf shows only the granted badges that have an image', async () => {
    const a = await created('A');
    badges.grants.set(BIA_ID, [a, await created('B', false)]);

    expect((await service.badgesOf(BIA_ID)).map((badge) => badge.name)).toEqual(['A']);
  });

  it('openImage serves the current image; a replaced one is BADGE_IMAGE_NOT_FOUND', async () => {
    const id = await created('A');
    await service.uploadImage(id, PNG, null);

    expect((await service.openImage('img-2')).contentType).toBe('image/webp');
    await expect(service.openImage('img-1')).rejects.toThrow(BadgeImageNotFoundError);
  });
});
