import { describe, expect, it } from 'vitest';
import { addPlayersAckDto, addPlayersCommandDto } from '../../src/board/character.dto';

const ACTION = '0f9e8d7c-6b5a-4f3e-9d2c-1b0a9f8e7d6c';
const VHARN = '3b1e9a52-6c4d-4f8a-9e2b-1a7c5d3f8e10';
const SALAO = '7d3c2b1a-0f9e-4d8c-b7a6-5e4d3c2b1a0f';
const LYRA = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const BIA = '9c8b7a6f-5e4d-4c3b-a2f1-0e9d8c7b6a5f';
const ENVELOPE = { actionId: ACTION, campaignId: VHARN, sceneId: SALAO };

describe('adding the players to a grid', () => {
  it('token:addPlayers takes the center cell, in steps of half a cell', () => {
    const add = { ...ENVELOPE, center: { col: 10, row: 6.5 } };
    expect(addPlayersCommandDto.parse(add).center).toEqual({ col: 10, row: 6.5 });
    const off = { ...ENVELOPE, center: { col: -1, row: 0.25 } };
    expect(addPlayersCommandDto.safeParse(off).success).toBe(false);
  });

  it('the addPlayers ack names the created tokens and the skipped players', () => {
    const ack = { ok: true, version: 5, createdIds: [LYRA], skippedMemberIds: [BIA] };
    expect(addPlayersAckDto.parse(ack)).toEqual(ack);
    expect(addPlayersAckDto.safeParse({ ok: true, version: 5, createdIds: [] }).success).toBe(
      false,
    );
  });
});
