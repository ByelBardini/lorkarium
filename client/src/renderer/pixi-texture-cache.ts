import { Assets, type Texture } from 'pixi.js';
import { IdleShelf } from './idle-shelf';

type Entry =
  | Readonly<{ state: 'loading' }>
  | Readonly<{ state: 'ready'; texture: Texture }>
  | Readonly<{ state: 'failed' }>;

/** What the cache asks `Assets` for: `/api/assets/<id>` has no extension, so the parser is
 *  named; the board's images are drawn far smaller than they are (a token zoomed out, a whole
 *  map), so they get mipmaps. */
export type TextureAsset = Readonly<{
  src: string;
  parser: 'texture';
  data: Readonly<{ autoGenerateMipmaps: boolean }>;
}>;

/** The loader the cache talks to: PixiJS `Assets`, or a fake in the specs. */
export interface TextureAssets {
  load(asset: TextureAsset): Promise<Texture>;
  unload(url: string): Promise<void>;
}

const PIXI_ASSETS: TextureAssets = {
  load: (asset) => Assets.load<Texture>(asset),
  unload: (url) => Assets.unload(url),
};

/** How many textures the view stopped drawing stay loaded, waiting to come back. */
export const IDLE_TEXTURE_LIMIT = 64;

/** The images of the board (background, token art, condition images), loaded once per url. A
 *  url the view stops drawing waits in a slack (`IdleShelf`, the oldest unloaded past
 *  `idleLimit`): a token that leaves the sight and comes back costs no new decode. A url that
 *  fails stays failed (the token keeps its initials disc, nothing retries in a loop); one that
 *  arrives after it was dropped is unloaded. `onReady` runs when a texture arrives, to draw again.
 *
 *  Example: `const textures = new PixiTextureCache((url) => tokens.refreshArt(url))` */
export class PixiTextureCache {
  private readonly entries = new Map<string, Entry>();
  private readonly idle: IdleShelf<Texture>;

  constructor(
    private readonly onReady: (url: string) => void,
    private readonly assets: TextureAssets = PIXI_ASSETS,
    idleLimit = IDLE_TEXTURE_LIMIT,
  ) {
    this.idle = new IdleShelf(idleLimit, (url) => this.unload(url));
  }

  /** Starts loading `url` before any board draws it (the snapshot arrived while the renderer still
   *  mounts): `Assets` shares a load by url, so the cache's first `textureOf` takes the same one.
   *  A failure is left to that `textureOf`, which meets it on its own.
   *
   *  Example: `PixiTextureCache.prefetch(assetUrlOf(scene.background.assetId))` */
  static prefetch(url: string, assets: TextureAssets = PIXI_ASSETS): void {
    assets.load(textureAssetOf(url)).catch(() => undefined);
  }

  /** The texture when it is ready (or back from the slack); otherwise starts loading it (once)
   *  and answers `null`. */
  textureOf(url: string): Texture | null {
    const entry = this.entries.get(url);
    if (entry) return entry.state === 'ready' ? entry.texture : null;
    const shelved = this.idle.takeBack(url);
    if (shelved) this.entries.set(url, { state: 'ready', texture: shelved });
    else this.load(url);
    return shelved ?? null;
  }

  /** Moves every url the view no longer draws to the slack. */
  retain(urls: ReadonlySet<string>): void {
    for (const [url, entry] of this.entries) {
      if (urls.has(url)) continue;
      this.entries.delete(url);
      if (entry.state === 'ready') this.idle.shelve(url, entry.texture);
    }
  }

  destroy(): void {
    this.retain(new Set());
    this.idle.clear();
  }

  private load(url: string): void {
    const ticket: Entry = { state: 'loading' };
    this.entries.set(url, ticket);
    this.assets.load(textureAssetOf(url)).then(
      (texture) => this.arrived(url, ticket, texture),
      () => {
        if (this.entries.get(url) === ticket) this.entries.set(url, { state: 'failed' });
      },
    );
  }

  // Dropped while it loaded: nobody draws it, unless the url was asked again meanwhile (`Assets`
  // hands that load the same texture, so unloading it would pull it from under the new one).
  private arrived(url: string, ticket: Entry, texture: Texture): void {
    if (this.entries.get(url) === ticket) {
      this.entries.set(url, { state: 'ready', texture });
      return this.onReady(url);
    }
    if (!this.entries.has(url)) this.unload(url);
  }

  private unload(url: string): void {
    void this.assets.unload(url).catch(() => undefined);
  }
}

function textureAssetOf(url: string): TextureAsset {
  return { src: url, parser: 'texture', data: { autoGenerateMipmaps: true } };
}
