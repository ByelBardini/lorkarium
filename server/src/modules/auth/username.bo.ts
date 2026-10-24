export const USERNAME_MAX_LENGTH = 20;
const USERNAME_MIN_LENGTH = 3;
const SHORT_SUFFIX = '.rpg';
const EMPTY_FALLBACK = 'jogador';
// Every candidate of a stem starts with this many of its characters (a suffix of up to 5 digits
// still leaves 15), so one prefix lookup finds every @ that could collide.
const LOOKUP_PREFIX_LENGTH = USERNAME_MAX_LENGTH - 5;

/** The @ an account is born with, from the local part of its e-mail: before `+`, lowercased, only
 *  `a-z 0-9 . _`; empty → `jogador`, under 3 → `<x>.rpg`; up to 20, and taken → `2`, `3`… with
 *  the stem cut so the suffix fits. Migration 0037 fills the old accounts by this same rule.
 *
 *  Example: `usernameFromEmail('Bia+rpg@x.com', new Set(['bia'])) // 'bia2'` */
export function usernameFromEmail(email: string, taken: ReadonlySet<string>): string {
  return uniqueUsername(usernameStemOf(email), taken);
}

/** The first free @ from `stem`: the stem itself (cut to 20), then `<stem>2`, `<stem>3`…
 *
 *  Example: `uniqueUsername('admin', new Set(['admin'])) // 'admin2'` */
export function uniqueUsername(stem: string, taken: ReadonlySet<string>): string {
  const first = stem.slice(0, USERNAME_MAX_LENGTH);
  if (!taken.has(first)) return first;
  for (let suffix = 2; ; suffix += 1) {
    const digits = String(suffix);
    const candidate = stem.slice(0, USERNAME_MAX_LENGTH - digits.length) + digits;
    if (!taken.has(candidate)) return candidate;
  }
}

/** The @ the e-mail would give with nothing taken, before the cut to 20.
 *
 *  Example: `usernameStemOf('a@x.com') // 'a.rpg'` */
export function usernameStemOf(email: string): string {
  const local = email.split('@')[0]?.split('+')[0] ?? '';
  const raw = local.toLowerCase().replace(/[^a-z0-9._]/g, '');
  if (raw === '') return EMPTY_FALLBACK;
  return raw.length < USERNAME_MIN_LENGTH ? raw + SHORT_SUFFIX : raw;
}

/** What to look up so `taken` holds every @ that could collide with `stem`.
 *
 *  Example: `usernameLookupPrefix('bia') // 'bia'` */
export function usernameLookupPrefix(stem: string): string {
  return stem.slice(0, LOOKUP_PREFIX_LENGTH);
}
