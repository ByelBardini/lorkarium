import {
  CHAT_TEXT_MAX,
  type DiceRollPartDto,
  type DiceVisibilityDto,
  type SavedRollDto,
} from '@lorkarium/contracts';
import { savedRollCommandsOf, savedRollSlugOf } from './chat-commands-catalog';
import { savedRollPartsOf } from './dice-tray';
import { searchText } from './search-text';

/** Someone `/w` may name: by the nickname or by the @ (the composer leaves the viewer out). */
export type ChatInputMember = Readonly<{ userId: string; name: string; username: string }>;

/** Where the composer is: `atTable` (rolls and whispers exist only there) and `canRoll` (a
 *  spectator talks but does not roll). */
export type ChatInputContext = Readonly<{
  atTable: boolean;
  canRoll: boolean;
  savedRolls: readonly SavedRollDto[];
  members: readonly ChatInputMember[];
}>;

/** Why the input cannot go; the screen words each one. */
export type ChatInputRefusal =
  | Readonly<{ kind: 'unknown_command'; command: string }>
  | Readonly<{ kind: 'unknown_member'; name: string }>
  | Readonly<{ kind: 'missing_text'; name: string }>
  | Readonly<{ kind: 'missing_roll'; command: 'r' | 'gr' }>
  | Readonly<{ kind: 'too_long'; max: number }>
  | Readonly<{
      kind:
        | 'missing_member'
        | 'rolls_only_at_table'
        | 'whispers_only_at_table'
        | 'spectator_cannot_roll';
    }>;

/** What the composer does with the input: nothing, a message, a whisper at the Table, a roll
 *  through `dice:roll`, or a refusal shown under the field (the draft stays). */
export type ChatInputIntent =
  | Readonly<{ kind: 'empty' }>
  | Readonly<{ kind: 'message'; text: string }>
  | Readonly<{ kind: 'whisper'; userId: string; text: string }>
  | Readonly<{
      kind: 'roll';
      visibility: DiceVisibilityDto;
      label: string | null;
      parts: DiceRollPartDto[];
    }>
  | Readonly<{ kind: 'refused'; reason: ChatInputRefusal }>;

type WhisperTarget = Readonly<{ typed: string; member: ChatInputMember | null; text: string }>;

const VISIBILITY_OF: Readonly<Record<'r' | 'gr', DiceVisibilityDto>> = {
  r: 'public',
  gr: 'masters',
};

/** Reads the composer's field: `/r 1d20+5`, `/gr 2d6`, `/<saved roll>`, `/gr <saved roll>`,
 *  `/w Bia texto` (or `/w "Ana Clara" texto`), or plain text.
 *
 *  Example: `readChatInput('/gr ataque', context) // { kind: 'roll', visibility: 'masters', label: 'Ataque', parts }` */
export function readChatInput(raw: string, context: ChatInputContext): ChatInputIntent {
  const text = raw.trim();
  if (text === '') return { kind: 'empty' };
  if (!text.startsWith('/')) return messageOf(text);
  const [, command = '', rest = ''] = /^\/(\S*)\s*([\s\S]*)$/u.exec(text) ?? [];
  const name = searchText(command);
  if (name === 'w') return whisperOf(rest, context);
  if (name === 'r' || name === 'gr') return commandRollOf(name, rest, context);
  const saved = savedRollCommandsOf(context.savedRolls).get(name);
  if (saved) return rollBlockOf(context) ?? savedRollIntentOf(saved, 'public');
  return refused({ kind: 'unknown_command', command });
}

function messageOf(text: string): ChatInputIntent {
  if (text.length > CHAT_TEXT_MAX) return refused({ kind: 'too_long', max: CHAT_TEXT_MAX });
  return { kind: 'message', text };
}

function commandRollOf(
  command: 'r' | 'gr',
  rest: string,
  context: ChatInputContext,
): ChatInputIntent {
  const blocked = rollBlockOf(context);
  if (blocked) return blocked;
  if (rest === '') return refused({ kind: 'missing_roll', command });
  const visibility = VISIBILITY_OF[command];
  const saved = savedRollCommandsOf(context.savedRolls).get(savedRollSlugOf(rest));
  if (saved) return savedRollIntentOf(saved, visibility);
  return { kind: 'roll', visibility, label: null, parts: [{ label: null, expression: rest }] };
}

function rollBlockOf(context: ChatInputContext): ChatInputIntent | null {
  if (!context.atTable) return refused({ kind: 'rolls_only_at_table' });
  if (!context.canRoll) return refused({ kind: 'spectator_cannot_roll' });
  return null;
}

function savedRollIntentOf(saved: SavedRollDto, visibility: DiceVisibilityDto): ChatInputIntent {
  return { kind: 'roll', visibility, label: saved.name, parts: savedRollPartsOf(saved) };
}

function whisperOf(rest: string, context: ChatInputContext): ChatInputIntent {
  if (!context.atTable) return refused({ kind: 'whispers_only_at_table' });
  if (rest === '') return refused({ kind: 'missing_member' });
  const { typed, member, text } = whisperTargetOf(rest, context.members);
  if (member === null) return refused({ kind: 'unknown_member', name: typed });
  if (text === '') return refused({ kind: 'missing_text', name: member.name });
  const message = messageOf(text);
  return message.kind === 'message' ? { kind: 'whisper', userId: member.userId, text } : message;
}

// A quoted name is taken whole; otherwise the longest name the text starts with wins.
function whisperTargetOf(rest: string, members: readonly ChatInputMember[]): WhisperTarget {
  const quoted = /^"([^"]*)"\s*([\s\S]*)$/u.exec(rest);
  if (quoted) {
    const typed = (quoted[1] ?? '').trim();
    const member = members.find((each) => labelsOf(each).includes(searchText(typed))) ?? null;
    return { typed, member, text: (quoted[2] ?? '').trim() };
  }
  return longestNameAtStartOf(rest.normalize('NFC'), members);
}

function longestNameAtStartOf(rest: string, members: readonly ChatInputMember[]): WhisperTarget {
  const folded = searchText(rest);
  let best: Readonly<{ member: ChatInputMember; length: number }> | null = null;
  for (const member of members) {
    for (const label of labelsOf(member)) {
      const fits = folded === label || new RegExp(`^${escaped(label)}\\s`, 'u').test(folded);
      if (fits && label.length > (best?.length ?? 0)) best = { member, length: label.length };
    }
  }
  if (best === null) return { typed: rest.split(/\s/u)[0] ?? rest, member: null, text: '' };
  return {
    typed: rest.slice(0, best.length),
    member: best.member,
    text: rest.slice(best.length).trim(),
  };
}

function labelsOf(member: ChatInputMember): string[] {
  return [searchText(member.name.trim()), searchText(member.username.trim())];
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function refused(reason: ChatInputRefusal): ChatInputIntent {
  return { kind: 'refused', reason };
}
