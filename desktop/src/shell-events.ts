import { z } from 'zod';

// Mirrors `ShellEvent` in src-tauri/src/startup.rs (serde `tag = "kind"`, kebab-case).
const shellEventSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('checking-update') }),
  z.strictObject({
    kind: z.literal('downloading'),
    downloaded: z.number().int().nonnegative(),
    total: z.number().int().nonnegative().nullable(),
  }),
  z.strictObject({ kind: z.literal('installing') }),
  z.strictObject({ kind: z.literal('connecting') }),
  z.strictObject({ kind: z.literal('server-unavailable') }),
  z.strictObject({ kind: z.literal('offline') }),
]);

export type ShellEvent = z.infer<typeof shellEventSchema>;

export type ShellEventReading =
  { event: ShellEvent; problem: null } | { event: null; problem: string };

/** Validates what the Rust side emitted before it becomes splash state; a newer shell may send kinds this splash does not know.
 *
 *  Example: `readShellEvent({ kind: 'offline' }) // { event: { kind: 'offline' }, problem: null }` */
export function readShellEvent(payload: unknown): ShellEventReading {
  const parsed = shellEventSchema.safeParse(payload);
  if (parsed.success) return { event: parsed.data, problem: null };
  return {
    event: null,
    problem: `evento da casca inválido: ${JSON.stringify(payload)}; esperado { kind: "${KNOWN_KINDS}" } (${parsed.error.message})`,
  };
}

const KNOWN_KINDS = shellEventSchema.options.map((option) => option.shape.kind.value).join('" | "');
