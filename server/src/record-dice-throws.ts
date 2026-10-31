import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CannonDicePhysics } from './infrastructure/dice-physics/cannon-dice-physics';
import {
  diceThrowRecordingOf,
  settlesNearCentre,
  type RecordedDiceThrow,
} from './infrastructure/dice-physics/dice-throw-recording';
import { CryptoDiceRandom } from './infrastructure/dice-random/crypto-dice-random';

// The landing's Act V rolls one d20 ("Rolar o d20"), in a stage about as wide as a 16:9 window.
// The stage zooms into the middle of the box (the die would be a speck otherwise), so only the
// throws that come to rest there are kept.
const SETS = [['d20']];
const WANTED = 12;
const ASPECT = 16 / 9;
const CENTRAL_SHARE = 0.4;
const MAX_ATTEMPTS = 600;
const OUTPUT = fileURLToPath(new URL('../../site/src/assets/dice/throws.json', import.meta.url));

const physics = new CannonDicePhysics(new CryptoDiceRandom());
const recorded: RecordedDiceThrow[] = [];
for (let attempt = 0; attempt < MAX_ATTEMPTS && recorded.length < WANTED; attempt += 1) {
  const [candidate] = diceThrowRecordingOf({ physics, sets: SETS, perSet: 1, aspect: ASPECT });
  if (candidate && settlesNearCentre(candidate, CENTRAL_SHARE)) recorded.push(candidate);
}
if (recorded.length < WANTED) {
  throw new Error(
    `Only ${recorded.length} of ${MAX_ATTEMPTS} throws rested in the central ${CENTRAL_SHARE} of the box; expected ${WANTED}`,
  );
}
const json = `${JSON.stringify(recorded)}\n`;
writeFileSync(OUTPUT, json);
const values = recorded.map((item) => item.values.join('+')).join(', ');
process.stdout.write(
  `${recorded.length} arremessos (${json.length} bytes) em ${OUTPUT}: ${values}\n`,
);
