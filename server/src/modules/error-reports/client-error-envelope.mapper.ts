import {
  errorReportEnvelopeHeaderDto,
  errorReportEventDto,
  errorReportItemHeaderDto,
  type ErrorReportItemHeaderDto,
} from '@lorkarium/contracts';
import type { z } from 'zod';
import type {
  ClientErrorEnvelope,
  ClientErrorEnvelopeItem,
  ClientErrorEvent,
} from './client-error-envelope.bo';
import { ErrorReportError } from './error-reports.error';

const NEWLINE = 0x0a;
const QUOTED_MAX = 80;

/** The payload of an `event` item, read.
 *
 *  Example: `clientErrorEventOf('{"request":{"url":"/x?t=1"}}').request?.url // '/x?t=1'` */
export function clientErrorEventOf(payload: string): ClientErrorEvent {
  const parsed = errorReportEventDto.safeParse(parsedJson(payload));
  if (parsed.success) return parsed.data;
  const received = JSON.stringify(payload.slice(0, QUOTED_MAX));
  throw new ErrorReportError(
    'INVALID_ENVELOPE',
    `an event must be a JSON object (received ${received})`,
  );
}

/** Reads the newline-delimited envelope; an item `length` counts UTF-8 bytes, not characters, and
 *  an `event` payload is read too (a broken one refuses the whole envelope).
 *
 *  Example: `clientErrorEnvelopeOf(body).items[0]?.header.type // 'event'` */
export function clientErrorEnvelopeOf(text: string): ClientErrorEnvelope {
  const bytes = Buffer.from(text, 'utf8');
  const reader = { bytes, offset: 0, line: 0 };
  const header = jsonLineOf(reader, errorReportEnvelopeHeaderDto, 'the envelope header');
  const items: ClientErrorEnvelopeItem[] = [];
  while (reader.offset < bytes.length) {
    if (restIsBlank(reader)) break;
    const itemHeader = jsonLineOf(reader, errorReportItemHeaderDto, 'an item header');
    const payload = payloadOf(reader, itemHeader);
    const event = itemHeader.type === 'event' ? clientErrorEventOf(payload) : null;
    items.push({ header: itemHeader, payload, event });
  }
  return { header, items };
}

/** The envelope back as text, each `length` recounted for the payload as it is now.
 *
 *  Example: `envelopeTextOf(clientErrorEnvelopeOf(body)) === body // true` */
export function envelopeTextOf(envelope: ClientErrorEnvelope): string {
  const lines = [JSON.stringify(envelope.header)];
  for (const { header, payload } of envelope.items) {
    // The payload, not the event: the BO writes the stamped event back into it.
    const counted =
      header.length === undefined ? header : { ...header, length: Buffer.byteLength(payload) };
    lines.push(JSON.stringify(counted), payload);
  }
  return `${lines.join('\n')}\n`;
}

type EnvelopeReader = { bytes: Buffer; offset: number; line: number };

function nextLine(reader: EnvelopeReader): string {
  const end = reader.bytes.indexOf(NEWLINE, reader.offset);
  const stop = end === -1 ? reader.bytes.length : end;
  const line = reader.bytes.toString('utf8', reader.offset, stop);
  reader.offset = stop + 1;
  reader.line += 1;
  return line;
}

function jsonLineOf<Schema extends z.ZodType>(
  reader: EnvelopeReader,
  schema: Schema,
  what: string,
): z.infer<Schema> {
  const line = nextLine(reader);
  const parsed = schema.safeParse(parsedJson(line));
  if (parsed.success) return parsed.data;
  throw invalidEnvelope(reader.line, `${what} must be a JSON object with its fields`, line);
}

function payloadOf(reader: EnvelopeReader, header: ErrorReportItemHeaderDto): string {
  if (header.length === undefined) return nextLine(reader);
  const end = reader.offset + header.length;
  if (end > reader.bytes.length) {
    const rest = reader.bytes.length - reader.offset;
    throw invalidEnvelope(reader.line + 1, `the item says ${header.length} bytes`, `${rest} left`);
  }
  const payload = reader.bytes.toString('utf8', reader.offset, end);
  // The payload of a sized item may or may not be followed by its newline.
  reader.offset = reader.bytes[end] === NEWLINE ? end + 1 : end;
  reader.line += 1;
  return payload;
}

function restIsBlank(reader: EnvelopeReader): boolean {
  return reader.bytes.toString('utf8', reader.offset).trim() === '';
}

function parsedJson(line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return undefined;
  }
}

function invalidEnvelope(line: number, rule: string, received: string): ErrorReportError {
  const quoted = JSON.stringify(received.slice(0, QUOTED_MAX));
  return new ErrorReportError('INVALID_ENVELOPE', `line ${line}: ${rule} (received ${quoted})`);
}
