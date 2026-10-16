import { cell } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import {
  ROUTE_BEND_DWELL_MS,
  routePath,
  settleRoute,
  startRoute,
  stepRoute,
} from '@/lib/token-route';

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
