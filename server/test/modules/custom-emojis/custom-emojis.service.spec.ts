import { CUSTOM_EMOJI_MAX_BYTES } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  CustomEmojiNameTakenError,
  CustomEmojiNotFoundError,
  CustomEmojiTooLargeError,
  UnsupportedCustomEmojiError,
} from '../../../src/modules/custom-emojis/custom-emoji.error';
import { CustomEmojisService } from '../../../src/modules/custom-emojis/custom-emojis.service';
import { PlanLimitError } from '../../../src/modules/plans/plans.error';
import { AssetStorageFake } from '../../support/assets-fakes';
import {
  CustomEmojisDaoFake,
  EmojiPictureProcessorFake,
  EmojiRefsForgetFake,
  planAccount,
} from '../../support/custom-emojis-fakes';

const BIA = '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a';
const CAIO = '2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b';
const NEW_ID = '3c3c3c3c-3c3c-4c3c-8c3c-3c3c3c3c3c3c';
const PNG = Uint8Array.from([1, 2, 3]);

function harness(plan: Parameters<typeof planAccount>[0] = 'apoiador') {
  const emojis = new CustomEmojisDaoFake().owner(BIA, planAccount(plan));
  emojis.owner(CAIO, planAccount('lenda'));
  const storage = new AssetStorageFake();
  const processor = new EmojiPictureProcessorFake();
  const refs = new EmojiRefsForgetFake();
  const service = new CustomEmojisService({
    emojis,
    transaction: (work) => work(emojis, emojis),
    storage,
    processor,
    refs,
    newId: () => NEW_ID,
  });
  return { service, emojis, storage, processor, refs };
}

function seedMany(emojis: CustomEmojisDaoFake, ownerId: string, count: number): void {
  for (let at = 0; at < count; at += 1) emojis.seed(ownerId, `id-${at}`, `nome${at}`);
}

describe('CustomEmojisService.create', () => {
  it('a still picture: one object, the row, the cache forgotten and the list back', async () => {
    const { service, storage, refs } = harness('apoiador');

    const list = await service.create(BIA, 'festa', PNG);

    expect([...storage.objects.keys()]).toEqual([`custom-emojis/${NEW_ID}`]);
    expect(list).toEqual({
      emojis: [
        expect.objectContaining({ id: NEW_ID, name: 'festa', animated: false, active: true }),
      ],
      limit: 10,
    });
    expect(refs.forgotten).toEqual([BIA]);
  });

  it('a GIF on Lenda keeps the moving picture and the first frame beside it', async () => {
    const { service, storage, processor } = harness('lenda');
    processor.sourceFrames = 3;

    const list = await service.create(BIA, 'festa', PNG);

    expect(storage.objects.get(`custom-emojis/${NEW_ID}`)?.bytes).toEqual(Uint8Array.from([3]));
    expect(storage.objects.get(`custom-emojis/${NEW_ID}-still`)?.bytes).toEqual(
      Uint8Array.from([1]),
    );
    expect(list.emojis[0]?.animated).toBe(true);
  });

  it('a GIF on Narrador is kept still, and never decoded as moving', async () => {
    const { service, storage, processor } = harness('narrador');
    processor.sourceFrames = 3;

    const list = await service.create(BIA, 'festa', PNG);

    expect([...storage.objects.keys()]).toEqual([`custom-emojis/${NEW_ID}`]);
    expect(processor.shapes).toEqual([{ width: 128, height: 128, animated: false }]);
    expect(list.emojis[0]?.animated).toBe(false);
  });

  it('Apoiador with 10 is refused before decoding, naming the ceiling', async () => {
    const { service, emojis, processor, storage } = harness('apoiador');
    seedMany(emojis, BIA, 10);

    const refusal = service.create(BIA, 'festa', PNG);

    await expect(refusal).rejects.toBeInstanceOf(PlanLimitError);
    await expect(refusal).rejects.toMatchObject({ resource: 'customEmojis', limit: 10 });
    expect(processor.shapes).toEqual([]);
    expect(storage.objects.size).toBe(0);
  });

  it('Grátis has no room at all', async () => {
    const { service } = harness('free');

    await expect(service.create(BIA, 'festa', PNG)).rejects.toMatchObject({
      resource: 'customEmojis',
      limit: 0,
      plan: 'free',
    });
  });

  it('amigo_do_dono with 500 still creates', async () => {
    const { service, emojis } = harness('amigo_do_dono');
    seedMany(emojis, BIA, 500);

    const list = await service.create(BIA, 'festa', PNG);

    expect(list.emojis).toHaveLength(501);
    expect(list.limit).toBeNull();
  });

  it('a picture above 2 MiB is refused before anything, citing the size', async () => {
    const { service, processor } = harness();
    const huge = new Uint8Array(CUSTOM_EMOJI_MAX_BYTES + 1);

    await expect(service.create(BIA, 'festa', huge)).rejects.toBeInstanceOf(
      CustomEmojiTooLargeError,
    );
    expect(processor.shapes).toEqual([]);
  });

  it('bytes the processor refuses are an unsupported image, with its words', async () => {
    const { service, processor } = harness();
    processor.refusal = { reason: 'format', detail: 'got svg: expected png, jpeg, webp or gif' };

    await expect(service.create(BIA, 'festa', PNG)).rejects.toThrow(UnsupportedCustomEmojiError);
    await expect(service.create(BIA, 'festa', PNG)).rejects.toThrow(/got svg/u);
  });

  it('a name the account already has: refused, and the picture sent up is taken back', async () => {
    const { service, emojis, storage } = harness();
    emojis.seed(BIA, 'old', 'festa');

    await expect(service.create(BIA, 'festa', PNG)).rejects.toBeInstanceOf(
      CustomEmojiNameTakenError,
    );
    expect(storage.objects.size).toBe(0);
  });

  it('another account’s name is free: Caio and Bia both have :festa:', async () => {
    const { service, emojis } = harness();
    emojis.seed(CAIO, 'caio-festa', 'festa');

    const list = await service.create(BIA, 'festa', PNG);

    expect(list.emojis.map((emoji) => emoji.name)).toEqual(['festa']);
  });
});

describe('CustomEmojisService.list', () => {
  it('past the ceiling the newest are inactive, none is gone', async () => {
    const { service, emojis } = harness('apoiador');
    seedMany(emojis, BIA, 12);

    const list = await service.list(BIA);

    expect(list.emojis).toHaveLength(12);
    expect(list.emojis.filter((emoji) => !emoji.active).map((emoji) => emoji.name)).toEqual([
      'nome10',
      'nome11',
    ]);
  });

  it('a GIF of someone who left the Lenda reads as still', async () => {
    const { service, emojis } = harness('narrador');
    emojis.seed(BIA, 'gif', 'festa', true);

    expect((await service.list(BIA)).emojis[0]?.animated).toBe(false);
  });
});

describe('CustomEmojisService.rename and remove', () => {
  it('renames the account’s own emoji and forgets the cache', async () => {
    const { service, emojis, refs } = harness();
    emojis.seed(BIA, 'e1', 'festa');

    const list = await service.rename(BIA, 'e1', 'bolo');

    expect(list.emojis.map((emoji) => emoji.name)).toEqual(['bolo']);
    expect(refs.forgotten).toEqual([BIA]);
  });

  it('never renames nor removes another account’s emoji', async () => {
    const { service, emojis } = harness();
    emojis.seed(CAIO, 'e1', 'festa');

    await expect(service.rename(BIA, 'e1', 'bolo')).rejects.toBeInstanceOf(
      CustomEmojiNotFoundError,
    );
    await expect(service.remove(BIA, 'e1')).rejects.toBeInstanceOf(CustomEmojiNotFoundError);
    expect(emojis.rows.map((row) => row.name)).toEqual(['festa']);
  });

  it('removes the row and both pictures of a GIF', async () => {
    const { service, emojis, storage } = harness('lenda');
    emojis.seed(BIA, 'e1', 'festa', true);
    await storage.put('custom-emojis/e1', PNG, 'image/webp');
    await storage.put('custom-emojis/e1-still', PNG, 'image/webp');

    const list = await service.remove(BIA, 'e1');

    expect(list.emojis).toEqual([]);
    expect(storage.objects.size).toBe(0);
  });
});

describe('CustomEmojisService.open', () => {
  it('serves the moving picture while the owner is on Lenda, the first frame after', async () => {
    const { service, emojis, storage } = harness('lenda');
    emojis.seed(BIA, 'e1', 'festa', true);
    await storage.put('custom-emojis/e1', PNG, 'image/webp');
    await storage.put('custom-emojis/e1-still', PNG, 'image/webp');

    await service.open('e1');
    emojis.owner(BIA, planAccount('narrador'));
    await service.open('e1');

    expect(storage.opened).toEqual(['custom-emojis/e1', 'custom-emojis/e1-still']);
  });

  it('an unknown id, or a picture gone from the bucket, is not found', async () => {
    const { service, emojis } = harness();
    emojis.seed(BIA, 'e1', 'festa');

    await expect(service.open('nope')).rejects.toBeInstanceOf(CustomEmojiNotFoundError);
    await expect(service.open('e1')).rejects.toBeInstanceOf(CustomEmojiNotFoundError);
  });
});
