import { cell } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import {
  ROUTE_BEND_DWELL_MS,
  routePath,
  settleRoute,
  startRoute,
  stepRoute,
  routeBends,
} from '@/lib/token-route';
import { blockedPassage, tokenCenter, wall, type Cell } from '@lorkarium/game-core';

const ORIGIN = cell(1, 6);

describe('token route', () => {
  it('a fresh route is only the start', () => {
    expect(routePath(startRoute(ORIGIN, 0))).toEqual([ORIGIN]);
  });

  it('passing over cells without stopping keeps a straight line from the start', () => {
    let route = startRoute(ORIGIN, 0);
    route = stepRoute(route, cell(2, 6), 100);
    route = stepRoute(route, cell(3, 6), 200);
    expect(routePath(route)).toEqual([ORIGIN, cell(3, 6)]);
  });

  it('standing 2 s on a cell fixes a bend there, and the line turns from it', () => {
    let route = stepRoute(startRoute(ORIGIN, 0), cell(5, 6), 100);
    route = settleRoute(route, 100 + ROUTE_BEND_DWELL_MS);
    route = stepRoute(route, cell(5, 2), 2500);
    expect(routePath(route)).toEqual([ORIGIN, cell(5, 6), cell(5, 2)]);
  });

  it('a stop shorter than 2 s fixes nothing', () => {
    let route = stepRoute(startRoute(ORIGIN, 0), cell(5, 6), 100);
    route = settleRoute(route, 100 + ROUTE_BEND_DWELL_MS - 1);
    expect(route.bends).toEqual([]);
  });

  it('a long stop also bends when the next step comes before any settle', () => {
    let route = stepRoute(startRoute(ORIGIN, 0), cell(5, 6), 100);
    route = stepRoute(route, cell(5, 2), 100 + ROUTE_BEND_DWELL_MS);
    expect(route.bends).toEqual([cell(5, 6)]);
  });

  it('standing still on the start or on the last bend adds no bend', () => {
    const atStart = settleRoute(startRoute(ORIGIN, 0), ROUTE_BEND_DWELL_MS * 3);
    expect(atStart.bends).toEqual([]);
    const bent = settleRoute(stepRoute(atStart, cell(5, 6), 0), ROUTE_BEND_DWELL_MS);
    expect(settleRoute(bent, ROUTE_BEND_DWELL_MS * 5).bends).toEqual([cell(5, 6)]);
  });

  it('stepping back onto the last bend undoes it', () => {
    let route = stepRoute(startRoute(ORIGIN, 0), cell(5, 6), 0);
    route = settleRoute(route, ROUTE_BEND_DWELL_MS);
    route = stepRoute(route, cell(5, 5), 2100);
    route = stepRoute(route, cell(5, 6), 2200);
    expect(route.bends).toEqual([]);
    expect(routePath(route)).toEqual([ORIGIN, cell(5, 6)]);
  });

  it('the path does not repeat the bend the token stands on', () => {
    const route = settleRoute(stepRoute(startRoute(ORIGIN, 0), cell(5, 6), 0), ROUTE_BEND_DWELL_MS);
    expect(routePath(route)).toEqual([ORIGIN, cell(5, 6)]);
  });
});

describe('token route around walls', () => {
  // An L of walls: down x = 4 from y = 0 to 4, then right along y = 4 to x = 9.
  const L_WALLS = [
    wall({
      kind: 'wall',
      shape: 'line',
      x: 4,
      y: 0,
      width: 0,
      height: 4,
      points: [
        [0, 0],
        [0, 4],
      ],
      doorState: null,
    }),
    wall({
      kind: 'wall',
      shape: 'line',
      x: 4,
      y: 4,
      width: 5,
      height: 0,
      points: [
        [0, 0],
        [5, 0],
      ],
      doorState: null,
    }),
  ];
  const ONE = { width: 1, height: 1 };
  const blocked = (from: Cell, to: Cell): boolean =>
    blockedPassage([tokenCenter(from, ONE), tokenCenter(to, ONE)], L_WALLS) !== null;

  it('turning the corner of the L gets a bend on the last free cell', () => {
    let route = startRoute(cell(2, 2), 0);
    route = stepRoute(route, cell(2, 5), 100, blocked);
    route = stepRoute(route, cell(6, 5), 200, blocked);

    expect(routeBends(route)).toEqual([cell(2, 5)]);
    expect(routePath(route)).toEqual([cell(2, 2), cell(2, 5), cell(6, 5)]);
  });

  it('straight through the wall the route stays on the cell before it', () => {
    let route = startRoute(cell(2, 2), 0);
    route = stepRoute(route, cell(3, 2), 100, blocked);
    route = stepRoute(route, cell(6, 2), 200, blocked);

    expect(route.current).toEqual(cell(3, 2));
    expect(routeBends(route)).toEqual([]);
  });

  it('without a block (the master) the line stays straight, as before', () => {
    let route = startRoute(cell(2, 2), 0);
    route = stepRoute(route, cell(6, 2), 100);

    expect(routePath(route)).toEqual([cell(2, 2), cell(6, 2)]);
  });

  it('going back over the bend undoes it, as before', () => {
    let route = startRoute(cell(2, 2), 0);
    route = stepRoute(route, cell(2, 5), 100, blocked);
    route = stepRoute(route, cell(6, 5), 200, blocked);
    route = stepRoute(route, cell(2, 5), 300, blocked);

    expect(routeBends(route)).toEqual([]);
  });
});
