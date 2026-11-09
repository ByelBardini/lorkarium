import type { LibraryMapDetailDto } from '@lorkarium/contracts';
import type { LibraryMapsApi, LibraryMapsResult } from '@/services/library-maps-api';

type MapsMethod = keyof LibraryMapsApi;
type ResultOf<M extends MapsMethod> = Awaited<ReturnType<LibraryMapsApi[M]>>;
type DetailResult = LibraryMapsResult<LibraryMapDetailDto>;

const UNSCRIPTED = { ok: false, failure: { kind: 'unexpected' } } as const;
const NOT_FOUND = { ok: false, failure: { kind: 'not_found' } } as const;

/** Scripted `LibraryMapsApi`: `detail` reads `maps` (by id; 404 when absent) unless `heldDetails`
 *  holds it, every other method answers what `answer(method, result)` set, and `calls` records
 *  `[campaignId, ...arguments]` per call.
 *
 *  Example: `fake.maps.set(MUNDO_ID, libraryMapDetail()); fake.answer('main', { ok: true, value: null })` */
export class LibraryMapsApiFake implements LibraryMapsApi {
  readonly calls: Array<Readonly<{ method: MapsMethod; args: readonly unknown[] }>> = [];
  readonly maps = new Map<string, LibraryMapDetailDto>();
  /** Set to hold every `detail`: each waits here until a spec calls it with the answer. */
  heldDetails: Array<(result: DetailResult) => void> | null = null;
  /** Answers every `detail` with this failure, instead of reading `maps`. */
  detailFailure: DetailResult | null = null;
  /** Set to hold every `updateRegion`: each waits here until a spec calls it with the answer. */
  heldRegionUpdates: Array<(result: ResultOf<'updateRegion'>) => void> | null = null;
  /** Set to hold every `showRegion`: each waits here until a spec calls it with the answer. */
  heldRegionShows: Array<(result: ResultOf<'showRegion'>) => void> | null = null;
  /** Set to hold every `appearances`: each waits here until a spec calls it with the answer. */
  heldAppearances: Array<(result: ResultOf<'appearances'>) => void> | null = null;
  /** Set to hold every `createRegion`: each waits here until a spec calls it with the answer. */
  heldRegionCreations: Array<(result: ResultOf<'createRegion'>) => void> | null = null;
  private readonly answers = new Map<MapsMethod, unknown>();

  answer<M extends MapsMethod>(method: M, result: ResultOf<M>): this {
    this.answers.set(method, result);
    return this;
  }

  detailCalls(): number {
    return this.calls.filter(({ method }) => method === 'detail').length;
  }

  detail(campaignId: string, mapId: string): Promise<DetailResult> {
    this.calls.push({ method: 'detail', args: [campaignId, mapId] });
    if (this.heldDetails) {
      const held = this.heldDetails;
      return new Promise((resolve) => held.push(resolve));
    }
    if (this.detailFailure) return Promise.resolve(this.detailFailure);
    const map = this.maps.get(mapId);
    return Promise.resolve(map ? { ok: true, value: map } : NOT_FOUND);
  }

  main(...args: Parameters<LibraryMapsApi['main']>): Promise<ResultOf<'main'>> {
    return this.reply('main', args);
  }
  create(...args: Parameters<LibraryMapsApi['create']>): Promise<ResultOf<'create'>> {
    return this.reply('create', args);
  }
  update(...args: Parameters<LibraryMapsApi['update']>): Promise<ResultOf<'update'>> {
    return this.reply('update', args);
  }
  remove(...args: Parameters<LibraryMapsApi['remove']>): Promise<ResultOf<'remove'>> {
    return this.reply('remove', args);
  }
  setMain(...args: Parameters<LibraryMapsApi['setMain']>): Promise<ResultOf<'setMain'>> {
    return this.reply('setMain', args);
  }
  unsetMain(...args: Parameters<LibraryMapsApi['unsetMain']>): Promise<ResultOf<'unsetMain'>> {
    return this.reply('unsetMain', args);
  }
  createRegion(
    ...args: Parameters<LibraryMapsApi['createRegion']>
  ): Promise<ResultOf<'createRegion'>> {
    if (!this.heldRegionCreations) return this.reply('createRegion', args);
    this.calls.push({ method: 'createRegion', args });
    const held = this.heldRegionCreations;
    return new Promise((resolve) => held.push(resolve));
  }
  updateRegion(
    ...args: Parameters<LibraryMapsApi['updateRegion']>
  ): Promise<ResultOf<'updateRegion'>> {
    if (!this.heldRegionUpdates) return this.reply('updateRegion', args);
    this.calls.push({ method: 'updateRegion', args });
    const held = this.heldRegionUpdates;
    return new Promise((resolve) => held.push(resolve));
  }
  removeRegion(
    ...args: Parameters<LibraryMapsApi['removeRegion']>
  ): Promise<ResultOf<'removeRegion'>> {
    return this.reply('removeRegion', args);
  }
  showRegion(...args: Parameters<LibraryMapsApi['showRegion']>): Promise<ResultOf<'showRegion'>> {
    if (!this.heldRegionShows) return this.reply('showRegion', args);
    this.calls.push({ method: 'showRegion', args });
    const held = this.heldRegionShows;
    return new Promise((resolve) => held.push(resolve));
  }
  appearances(
    ...args: Parameters<LibraryMapsApi['appearances']>
  ): Promise<ResultOf<'appearances'>> {
    if (!this.heldAppearances) return this.reply('appearances', args);
    this.calls.push({ method: 'appearances', args });
    const held = this.heldAppearances;
    return new Promise((resolve) => held.push(resolve));
  }

  private reply<M extends MapsMethod>(method: M, args: readonly unknown[]): Promise<ResultOf<M>> {
    this.calls.push({ method, args });
    return Promise.resolve((this.answers.get(method) ?? UNSCRIPTED) as ResultOf<M>);
  }
}
