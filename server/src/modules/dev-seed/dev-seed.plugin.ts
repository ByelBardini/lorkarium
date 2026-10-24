import { StressSceneSeedService, type StressSceneSeedDeps } from './stress-scene-seed.service';

export type DevSeedModule = Readonly<{ stressScene: StressSceneSeedService }>;

/** Wires the dev seeds that go through other modules' services (no HTTP edge: a CLI runs them).
 *
 *  Example: `createDevSeedModule({ users, campaigns, join, roles, scenes, walls, lights, tokens }).stressScene` */
export function createDevSeedModule(deps: StressSceneSeedDeps): DevSeedModule {
  return { stressScene: new StressSceneSeedService(deps) };
}
