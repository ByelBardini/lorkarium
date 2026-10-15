import type { Credentials } from './sign-in';

// The test players of `pnpm db:seed-dev` (server/src/modules/auth/dev-players-seed.bo.ts):
// change both together.
export const BIA: Credentials = { email: 'bia@lorkarium.dev', password: 'lorkarium-dev' };
