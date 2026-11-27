import type { SceneSize } from '@lorkarium/game-core';
import { Container } from 'pixi.js';
import { CELL_WORLD_SIZE, type Point } from './camera';
import type { PixiTextureCache } from './pixi-texture-cache';
import { drawTokenBody, newTokenSprite, type TokenSprite } from './pixi-token-sprite';
import { spawnLandingOf, type SpawnGhostView } from './spawn-ghost';

// Faded enough to read as "not there yet", bright enough to recognize the token.
const PREVIEW_ALPHA = 0.55;

type Textures = Pick<PixiTextureCache, 'textureOf'>;

/** The saved token armed to spawn, drawn as the token itself (the same body as the board's
 *  tokens) faded where a press would put it. The body is drawn when the armed token changes or
 *  its image arrives; a pointer move only moves it (no redraw per move); off the scene it hides.
 *
 *  Example: `preview.draw(view.spawnGhost); preview.follow(view.grid.cells, world)` */
export class PixiSpawnGhost {
  readonly shape = new Container();
  private ghost: SpawnGhostView | null = null;
  private sprite: TokenSprite | null = null;

  constructor(private readonly textures: () => Textures | undefined) {
    this.shape.alpha = PREVIEW_ALPHA;
    this.shape.visible = false;
  }

  draw(ghost: SpawnGhostView | null): void {
    if (ghost === this.ghost) return;
    this.ghost = ghost;
    this.sprite?.root.destroy({ children: true });
    this.sprite?.overlay.destroy({ children: true });
    this.sprite = null;
    if (!ghost) return void (this.shape.visible = false);
    this.sprite = newTokenSprite(ghost.token, { x: 0, y: 0 }, 0, this.textures());
    this.shape.addChild(this.sprite.root);
    this.drawBody();
  }

  /** The image of `url` arrived: the preview shows it if it is its art. */
  refreshArt(url: string): void {
    if (this.sprite?.view.art?.url === url) this.drawBody();
  }

  follow(cells: SceneSize, world: Point): void {
    const landing = spawnLandingOf({ grid: { cells }, spawnGhost: this.ghost }, world);
    this.shape.visible = landing !== null;
    if (!landing) return;
    this.shape.position.set(landing.col * CELL_WORLD_SIZE, landing.row * CELL_WORLD_SIZE);
  }

  hide(): void {
    this.shape.visible = false;
  }

  private drawBody(): void {
    if (!this.sprite) return;
    const art = this.sprite.view.art;
    drawTokenBody(this.sprite, art ? (this.textures()?.textureOf(art.url) ?? null) : null);
  }
}
