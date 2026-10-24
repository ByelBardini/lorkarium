import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import type { PingMark } from '@/renderer/board-renderer';
import { PixiPingLayer } from '@/renderer/pixi-ping-layer';

const FRAME = { camera: { offsetX: 0, offsetY: 0, zoom: 1 }, screen: { width: 800, height: 600 } };

/** The name plates the layer asked for; each is an empty container (jsdom measures no text). */
class PingLabelFake {
  readonly made: string[] = [];

  readonly make = (label: string): Container => {
    this.made.push(label);
    return new Container();
  };
}

function mark(overrides: Partial<PingMark> = {}): PingMark {
  return { x: 5.5, y: 2.25, label: 'Bia', color: 0x8cc084, ...overrides };
}

function layerWith(reducedMotion = false) {
  const labels = new PingLabelFake();
  return { layer: new PixiPingLayer(() => reducedMotion, labels.make), labels };
}

describe('PixiPingLayer', () => {
  it('a shown ping is alive, at its point in world px, with its name plate', () => {
    const { layer, labels } = layerWith();

    layer.show(mark());

    expect(layer.aliveCount()).toBe(1);
    const [ping] = layer.world.children;
    expect([ping?.position.x, ping?.position.y]).toEqual([5.5 * CELL_WORLD_SIZE, 2.25 * 64]);
    expect(labels.made).toEqual(['Bia']);
  });

  it('3 s later the ping is gone and the layer is empty', () => {
    const { layer } = layerWith();
    layer.show(mark());

    layer.animate(2999, FRAME);
    const stillThere = layer.aliveCount();
    layer.animate(1, FRAME);

    expect(stillThere).toBe(1);
    const sizes = [layer.aliveCount(), layer.world.children.length, layer.edges.children.length];
    expect(sizes).toEqual([0, 0, 0]);
  });

  it('the 31st ping takes out the oldest: at most 30 on the board', () => {
    const { layer } = layerWith();

    for (let index = 0; index < 31; index += 1) layer.show(mark({ x: index }));

    expect(layer.aliveCount()).toBe(30);
    expect(layer.world.children[0]?.position.x).toBe(1 * CELL_WORLD_SIZE);
  });

  it('with no ping alive, animate touches nothing and asks for no render', () => {
    const { layer } = layerWith();

    expect(layer.animate(16, FRAME)).toBe(false);
  });

  it('with a ping alive, animate asks for a render', () => {
    const { layer } = layerWith();
    layer.show(mark());

    expect(layer.animate(16, FRAME)).toBe(true);
  });

  it('a ping off the view shows its arrow on the edge; one in view does not', () => {
    const { layer } = layerWith();
    layer.show(mark({ x: 50, y: 4 }));
    layer.show(mark({ x: 2, y: 2 }));

    layer.animate(16, FRAME);

    expect(layer.edges.children.map((arrow) => arrow.visible)).toEqual([true, false]);
    expect(layer.edges.children[0]?.position.x).toBe(800 - 24);
  });
});
