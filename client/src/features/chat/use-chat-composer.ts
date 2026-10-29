import type { ChatChannelDto, ChatSpeakerDto, SavedRollDto } from '@lorkarium/contracts';
import { useState } from 'react';
import type { ChatConversationTarget } from '@/lib/chat-conversations';
import { readChatInput, type ChatInputIntent, type ChatInputMember } from '@/lib/chat-input';
import { chatContactsOf, recipientsCheckOf, type ChatRecipientsCheck } from '@/lib/chat-recipients';
import type { ChatSendFailure, ChatSendRequest, ChatSendResult } from '@/services/chat-commands';
import type { DiceRoller } from '@/features/dice/use-dice-roller';
import {
  chatInputRefusalMessage,
  chatSendFailureMessage,
  offlineRecipientsText,
} from './chat-messages';
import type { ChatPeople } from './use-chat-people';

/** What rolling from the field needs; who only watches has `canRoll: false` and no roller. */
export type ComposerTools = Readonly<{
  canRoll: boolean;
  savedRolls: readonly SavedRollDto[];
  roller: DiceRoller | null;
}>;

export type ChatComposerInput = Readonly<{
  target: ChatConversationTarget;
  people: ChatPeople;
  /** The table's connection is up: without it nothing is sent (there is no queue). */
  live: boolean;
  send: (request: ChatSendRequest) => Promise<ChatSendResult>;
  tools: ComposerTools;
  /** Who a plain message at the Table speaks as ("Falar como"); a whisper is always oneself. */
  speaker: ChatSpeakerDto;
  /** Hears each refusal of the server (the "Falar como" goes back to "Você" on a lost token). */
  onRefused: (failure: ChatSendFailure) => void;
}>;

export type ChatComposerState = Readonly<{
  draft: string;
  setDraft: (draft: string) => void;
  /** Under the field, in pt-BR; the draft stays. */
  problem: string | null;
  /** The Table's "Pra quem": `null` is the whole Table. */
  whisperTo: string | null;
  setWhisperTo: (whisperTo: string | null) => void;
  recipients: ChatRecipientsCheck;
  canSend: boolean;
  submit: () => void;
}>;

/** The composer's state and what Enter does with the field: a message, a whisper (`/w`), a roll
 *  (`/r`, `/gr`, `/<saved>`) through the dice tab's roller, or a refusal under the field. Only a
 *  confirmed send or roll empties the field.
 *
 *  Example: `const composer = useChatComposer({ target, people, live, send, tools, speaker: { kind: 'self' }, onRefused })` */
export function useChatComposer(input: ChatComposerInput): ChatComposerState {
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [rollRefused, setRollRefused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [whisperTo, setWhisperTo] = useState<string | null>(null);
  const chosenWhisper = input.target.kind === 'table' ? whisperTo : null;
  const recipients = recipientsOf(input, chosenWhisper);
  const command = draft.trimStart().startsWith('/');
  const canSend = input.live && !busy && draft.trim() !== '' && (command || !recipients.blocked);
  const outcome: Outcome = { say: setProblem, rollRefused: setRollRefused };
  const submit = () => {
    if (!canSend) return;
    setBusy(true);
    setProblem(null);
    setRollRefused(false);
    void carryOut(intentOf(input, draft), input, chosenWhisper, outcome).then((done) => {
      setBusy(false);
      if (done) setDraft('');
    });
  };
  const shown = problem ?? (rollRefused ? (input.tools.roller?.problem ?? null) : null);
  return { draft, setDraft, problem: shown, whisperTo, setWhisperTo, recipients, canSend, submit };
}

/** The others of the table as `/w` and `@` may name them, online first. */
export function inputMembersOf(people: ChatPeople): ChatInputMember[] {
  return chatContactsOf(people.members, people.viewerId ?? '').map(
    ({ userId, name, username }) => ({ userId, name, username }),
  );
}

type Outcome = Readonly<{
  say: (problem: string) => void;
  rollRefused: (refused: boolean) => void;
}>;

function recipientsOf(input: ChatComposerInput, whisperTo: string | null): ChatRecipientsCheck {
  const { people } = input;
  return recipientsCheckOf(input.target, whisperTo, people.members, people.viewerId ?? '');
}

function intentOf(input: ChatComposerInput, draft: string): ChatInputIntent {
  return readChatInput(draft, {
    atTable: input.target.kind === 'table',
    canRoll: input.tools.canRoll,
    savedRolls: input.tools.savedRolls,
    members: inputMembersOf(input.people),
  });
}

async function carryOut(
  intent: ChatInputIntent,
  input: ChatComposerInput,
  whisperTo: string | null,
  outcome: Outcome,
): Promise<boolean> {
  if (intent.kind === 'empty') return false;
  if (intent.kind === 'refused') return refuse(chatInputRefusalMessage(intent.reason), outcome);
  if (intent.kind === 'roll') return rollFrom(intent, input, outcome);
  if (intent.kind === 'whisper') return whisperFrom(intent, input, outcome);
  const speaker = input.target.kind === 'table' && whisperTo === null ? input.speaker : SELF;
  return sendText(channelOf(input.target, whisperTo), speaker, intent.text, input, outcome);
}

const SELF: ChatSpeakerDto = { kind: 'self' };

function refuse(problem: string, outcome: Outcome): false {
  outcome.say(problem);
  return false;
}

async function rollFrom(
  intent: Extract<ChatInputIntent, { kind: 'roll' }>,
  input: ChatComposerInput,
  outcome: Outcome,
): Promise<boolean> {
  if (input.tools.roller === null) return false;
  const { label, parts, visibility } = intent;
  const rolled = await input.tools.roller.roll({ label, parts, visibility });
  if (!rolled) outcome.rollRefused(true);
  return rolled;
}

async function whisperFrom(
  intent: Extract<ChatInputIntent, { kind: 'whisper' }>,
  input: ChatComposerInput,
  outcome: Outcome,
): Promise<boolean> {
  const check = recipientsOf(input, intent.userId);
  if (check.blocked) {
    return refuse(offlineRecipientsText([input.people.nameOf(intent.userId)], true), outcome);
  }
  const channel: ChatChannelDto = { kind: 'table', whisperTo: intent.userId };
  return sendText(channel, SELF, intent.text, input, outcome);
}

async function sendText(
  channel: ChatChannelDto,
  speaker: ChatSpeakerDto,
  text: string,
  input: ChatComposerInput,
  outcome: Outcome,
): Promise<boolean> {
  const result = await input.send({ channel, speaker, text });
  if (result.ok) return true;
  input.onRefused(result.failure);
  return refuse(chatSendFailureMessage(result.failure), outcome);
}

function channelOf(target: ChatConversationTarget, whisperTo: string | null): ChatChannelDto {
  if (target.kind === 'direct') return { kind: 'direct', userId: target.userId };
  if (target.kind === 'group') {
    const { groupId, name, memberIds } = target;
    return { kind: 'group', groupId, name, memberIds: [...memberIds] };
  }
  return { kind: 'table', whisperTo };
}
