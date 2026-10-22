import { describe, expect, it } from 'vitest';
import {
  sessionActivityCommandDto,
  sessionCommandDto,
  sessionJoinAckDto,
  sessionMemberActivityDto,
} from '../../src/sessions/session.dto';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const CAMPAIGN_ID = '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a';
const STATE = { campaignId: CAMPAIGN_ID, version: 1, members: [], at: '2026-10-15T12:00:00.000Z' };
const ERROR = { code: 'CAMPAIGN_NOT_FOUND', message: 'Essa mesa não existe.' };

function commandIssuePathsOf(input: unknown): string[] {
  const result = sessionCommandDto.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => [...issue.path, ...keysOf(issue)].join('.'));
}

function keysOf(issue: object): string[] {
  return 'keys' in issue && Array.isArray(issue.keys) ? issue.keys : [];
}

describe('sessionCommandDto', () => {
  it('a session:join carrying a forged userId is refused on the userId key', () => {
    const forged = { actionId: ACTION_ID, campaignId: CAMPAIGN_ID, userId: ACTION_ID };
    expect(commandIssuePathsOf(forged)).toEqual(['userId']);
  });

  it('a session:join carrying a forged role is refused on the role key', () => {
    const forged = { actionId: ACTION_ID, campaignId: CAMPAIGN_ID, role: 'master' };
    expect(commandIssuePathsOf(forged)).toEqual(['role']);
  });

  it('an actionId and a campaignId, both uuids, are accepted as sent', () => {
    expect(sessionCommandDto.parse({ actionId: ACTION_ID, campaignId: CAMPAIGN_ID })).toEqual({
      actionId: ACTION_ID,
      campaignId: CAMPAIGN_ID,
    });
  });

  it('a campaignId that is not a uuid is refused on the campaignId path', () => {
    expect(commandIssuePathsOf({ actionId: ACTION_ID, campaignId: 'vharn' })).toEqual([
      'campaignId',
    ]);
  });
});

describe('sessionJoinAckDto', () => {
  it('a successful ack carries the session state', () => {
    expect(sessionJoinAckDto.parse({ ok: true, state: STATE })).toEqual({ ok: true, state: STATE });
  });

  it('a failed ack carries the api error', () => {
    expect(sessionJoinAckDto.parse({ ok: false, error: ERROR })).toEqual({
      ok: false,
      error: ERROR,
    });
  });

  it('a successful ack carrying an error instead of the state is refused', () => {
    expect(sessionJoinAckDto.safeParse({ ok: true, error: ERROR }).success).toBe(false);
  });

  it('a snapshot with a negative version is refused', () => {
    const ack = { ok: true, state: { ...STATE, version: -1 } };
    expect(sessionJoinAckDto.safeParse(ack).success).toBe(false);
  });
});

describe('sessionActivityCommandDto', () => {
  it('a command saying the tab went away is accepted as sent', () => {
    const command = { actionId: ACTION_ID, campaignId: CAMPAIGN_ID, away: true };

    expect(sessionActivityCommandDto.parse(command)).toEqual(command);
  });

  it('a command carrying a forged userId is refused (who asks comes from the connection, §7.3)', () => {
    const forged = { actionId: ACTION_ID, campaignId: CAMPAIGN_ID, away: true, userId: ACTION_ID };

    expect(sessionActivityCommandDto.safeParse(forged).success).toBe(false);
  });

  it('a command without away is refused', () => {
    const command = { actionId: ACTION_ID, campaignId: CAMPAIGN_ID };

    expect(sessionActivityCommandDto.safeParse(command).success).toBe(false);
  });
});

describe('sessionMemberActivityDto', () => {
  it('coming back is an event with awaySince null', () => {
    const event = {
      campaignId: CAMPAIGN_ID,
      version: 4,
      userId: ACTION_ID,
      awaySince: null,
      at: '2026-10-22T12:00:00.000Z',
    };

    expect(sessionMemberActivityDto.parse(event)).toEqual(event);
  });
});
