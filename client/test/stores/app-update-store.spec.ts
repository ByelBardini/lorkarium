import { describe, expect, it } from 'vitest';
import { createAppUpdateStore } from '@/stores/app-update-store';
import { PublishedBuildFake } from '../support/published-build-fake';

const RUNNING = '/assets/index-old.js';
const DEPLOYED = '/assets/index-new.js';

describe('createAppUpdateStore', () => {
  it('starts fresh and stays fresh while the server publishes the running build', async () => {
    const appUpdate = createAppUpdateStore({
      running: RUNNING,
      published: new PublishedBuildFake(RUNNING),
    });
    await appUpdate.getState().check();
    expect(appUpdate.getState().stale).toBe(false);
  });

  it('turns stale when the server publishes another build', async () => {
    const appUpdate = createAppUpdateStore({
      running: RUNNING,
      published: new PublishedBuildFake(DEPLOYED),
    });
    await appUpdate.getState().check();
    expect(appUpdate.getState().stale).toBe(true);
  });

  it('takes an unreadable answer or a page without build as no news', async () => {
    const published = new PublishedBuildFake(null);
    const appUpdate = createAppUpdateStore({ running: RUNNING, published });
    await appUpdate.getState().check();
    published.publish('');
    await appUpdate.getState().check();
    expect(appUpdate.getState().stale).toBe(false);
  });

  it('never asks when the page runs no build (the dev server)', async () => {
    const published = new PublishedBuildFake(DEPLOYED);
    const appUpdate = createAppUpdateStore({ running: '', published });
    await appUpdate.getState().check();
    expect([published.asks, appUpdate.getState().stale]).toEqual([0, false]);
  });

  it('stops asking once stale', async () => {
    const published = new PublishedBuildFake(DEPLOYED);
    const appUpdate = createAppUpdateStore({ running: RUNNING, published });
    await appUpdate.getState().check();
    await appUpdate.getState().check();
    expect(published.asks).toBe(1);
  });

  it('answers checks made while one is in flight with the same request', async () => {
    const published = new PublishedBuildFake(RUNNING);
    const appUpdate = createAppUpdateStore({ running: RUNNING, published });
    await Promise.all([appUpdate.getState().check(), appUpdate.getState().check()]);
    await appUpdate.getState().check();
    expect(published.asks).toBe(2);
  });
});
