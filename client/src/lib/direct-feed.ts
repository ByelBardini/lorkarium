import type { DmSentDto } from '@lorkarium/contracts';
import { CHAT_BLOCK_GAP_MS } from './chat-feed';

/** Consecutive messages of one author, no more than `CHAT_BLOCK_GAP_MS` apart: drawn as one block
 *  with the time at its end. */
export type DirectFeedRun = Readonly<{
  fromUserId: string;
  mine: boolean;
  messages: readonly DmSentDto[];
}>;

/** The messages of one local day, under its separator. */
export type DirectFeedDay = Readonly<{
  key: string;
  label: string;
  runs: readonly DirectFeedRun[];
}>;

const DAY_AND_MONTH = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' });
const DAY_MS = 24 * 60 * 60_000;

/** A direct conversation as the feed draws it: by local day, then by runs of one author.
 *
 *  Example: `directFeedOf(conversation.messages, me.id, new Date())[0].label // 'Hoje'` */
export function directFeedOf(
  messages: readonly DmSentDto[],
  accountId: string,
  now: Date,
): DirectFeedDay[] {
  const days: Array<{ key: string; label: string; runs: DirectFeedRun[] }> = [];
  for (const message of messages) {
    const at = new Date(message.at);
    const key = localDayKey(at);
    let day = days.at(-1);
    if (day?.key !== key) {
      day = { key, label: dayLabelOf(at, now), runs: [] };
      days.push(day);
    }
    appendToRuns(day.runs, message, accountId);
  }
  return days;
}

function appendToRuns(runs: DirectFeedRun[], message: DmSentDto, accountId: string): void {
  const last = runs.at(-1);
  const previous = last?.messages.at(-1);
  const gap = previous ? Date.parse(message.at) - Date.parse(previous.at) : Infinity;
  if (last && last.fromUserId === message.fromUserId && gap <= CHAT_BLOCK_GAP_MS) {
    runs[runs.length - 1] = { ...last, messages: [...last.messages, message] };
    return;
  }
  runs.push({
    fromUserId: message.fromUserId,
    mine: message.fromUserId === accountId,
    messages: [message],
  });
}

/** "Hoje", "Ontem" or the day and month ("3 de novembro"), in local time.
 *
 *  Example: `dayLabelOf(new Date(2026, 10, 3), new Date(2026, 10, 12)) // '3 de novembro'` */
export function dayLabelOf(at: Date, now: Date): string {
  const key = localDayKey(at);
  if (key === localDayKey(now)) return 'Hoje';
  if (key === localDayKey(new Date(startOfDay(now) - DAY_MS))) return 'Ontem';
  return DAY_AND_MONTH.format(at);
}

function startOfDay(at: Date): number {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
}

function localDayKey(at: Date): string {
  return `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`;
}
