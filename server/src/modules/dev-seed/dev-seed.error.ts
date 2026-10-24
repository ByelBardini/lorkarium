/** `pnpm db:seed-stress` against production: a stress table never lands on real data. */
export class StressSeedRefusedError extends Error {
  readonly code = 'STRESS_SEED_REFUSED';

  constructor(readonly nodeEnv: string) {
    super(
      `the stress scene seed only runs outside production; received NODE_ENV=${nodeEnv}, expected development or test`,
    );
    this.name = 'StressSeedRefusedError';
  }
}

/** The stress table is Bia's (master) and Caio's (player): `pnpm db:seed-dev` creates them. */
export class StressSeedPlayersMissingError extends Error {
  readonly code = 'STRESS_SEED_PLAYERS_MISSING';

  constructor(readonly missingEmails: readonly string[]) {
    super(
      `the stress scene needs the dev players; missing ${missingEmails.join(', ')}: run pnpm db:seed-dev first`,
    );
    this.name = 'StressSeedPlayersMissingError';
  }
}
