import type { FastifyBaseLogger } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CommandRateLimitedError } from '../../../src/modules/board/board.error';
import { onCommand, type CommandEdgeDeps } from '../../../src/modules/board/board-command-edge';
import { CommandRateGuard } from '../../../src/realtime/command-rate-guard';
import type { RealtimeSocket } from '../../../src/realtime/realtime-server';
import { ClockFake } from '../../support/auth-fakes';

const OPEN_TABLE = '11111111-1111-4111-8111-111111111111';
const OTHER_TABLE = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-11-09T12:00:00Z');

/** A connection with one table open, seen as the user `bia`. */
class RealtimeEdgeFake {
  readonly socket = {
    id: 's1',
    data: { campaignIds: new Set([OPEN_TABLE]) },
    disconnect: () => undefined,
  } as unknown as RealtimeSocket;

  readonly deps: CommandEdgeDeps = {
    realtime: { reauthenticate: async () => ({ id: 'bia' }) as never },
    log: { error: () => undefined } as unknown as FastifyBaseLogger,
  };
}

/** The strict schema of a command, counting how many times it really parsed. */
class SchemaSpy {
  parses = 0;
  readonly schema = z
    .strictObject({ campaignId: z.uuid(), drawings: z.array(z.unknown()).optional() })
    .superRefine(() => {
      this.parses += 1;
    });
}

function stroke(points: number): object {
  return { points: Array.from({ length: points }, () => [1, 2]) };
}

describe('onCommand', () => {
  let edge: RealtimeEdgeFake;
  let spy: SchemaSpy;
  let handled: string[];
  let send: (payload: unknown) => Promise<{ ok: boolean; error?: { code: string } }>;

  beforeEach(() => {
    edge = new RealtimeEdgeFake();
    spy = new SchemaSpy();
    handled = [];
    const rate = new CommandRateGuard(
      new ClockFake(NOW),
      (socketId, seconds) => new CommandRateLimitedError(socketId, seconds),
    );
    const context = { deps: edge.deps, rate, socket: edge.socket };
    const listener = onCommand(context, spy.schema, async (userId) => {
      handled.push(userId);
      return { ok: true as const };
    });
    send = (payload) =>
      new Promise((resolve) => listener(payload, resolve as Parameters<typeof listener>[1]));
  });

  it('a command on the open table is parsed and handled for the user of the connection', async () => {
    expect(await send({ campaignId: OPEN_TABLE })).toMatchObject({ ok: true });
    expect(handled).toEqual(['bia']);
  });

  it('a table not open on this connection is refused without the full parse', async () => {
    const answer = await send({ campaignId: OTHER_TABLE, drawings: [stroke(2000)] });

    expect(answer.error?.code).toBe('CAMPAIGN_NOT_FOUND');
    expect(spy.parses).toBe(0);
  });

  it('a body with no valid table id is INVALID_BODY', async () => {
    expect((await send({ campaignId: 'nope' })).error?.code).toBe('INVALID_BODY');
    expect(spy.parses).toBe(0);
  });

  it('a body invalid only for the full schema still reaches it on the open table', async () => {
    expect((await send({ campaignId: OPEN_TABLE, extra: 1 })).error?.code).toBe('INVALID_BODY');
  });

  it('a command heavier than the whole bucket is RATE_LIMITED before any parse', async () => {
    const drawings = Array.from({ length: 64 }, () => stroke(2000));

    expect((await send({ campaignId: OPEN_TABLE, drawings })).error?.code).toBe('RATE_LIMITED');
    expect(spy.parses).toBe(0);
  });

  it('heavy commands drain the bucket by weight: full strokes run out before 40 commands', async () => {
    const heavy = { campaignId: OPEN_TABLE, drawings: [stroke(2000)] };
    const answers = [];
    for (let sent = 0; sent < 9; sent += 1) answers.push(await send(heavy));

    expect(answers.slice(0, 8).every((answer) => answer.ok)).toBe(true);
    expect(answers[8]?.error?.code).toBe('RATE_LIMITED');
  });
});
