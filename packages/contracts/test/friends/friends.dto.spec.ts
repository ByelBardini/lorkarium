import { describe, expect, it } from 'vitest';
import { BLOCKS_MAX, FRIENDS_MAX, OUTGOING_REQUESTS_MAX } from '../../src/realtime-limits';
import { blockRequestDto, friendUserParamsDto } from '../../src/friends/block.dto';
import { friendRequestDto, friendRequestResponseDto } from '../../src/friends/friend-request.dto';
import { friendsOverviewDto } from '../../src/friends/friends-overview.dto';
import { friendDto } from '../../src/friends/friend.dto';
import {
  friendsChangedDto,
  presenceFriendChangedDto,
  presenceSetVisibilityCommandDto,
  presenceSyncAckDto,
} from '../../src/friends/presence.dto';

const BIA_ID = '6e5d4c3b-2a1f-4e0d-9c8b-7a6f5e4d3c2b';
const CAMPAIGN_ID = '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a';
const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const AT = '2026-11-12T12:00:00.000Z';

const BIA = {
  userId: BIA_ID,
  username: 'biaflor',
  name: 'Bia',
  color: 'rose',
  avatarId: null,
  plan: 'free',
  admin: false,
  lorkariumOwner: false,
};

describe('friendRequestDto', () => {
  it('normaliza o @ digitado com arroba e caixa alta', () => {
    expect(friendRequestDto.parse({ username: 'biaflor' }).username).toBe('biaflor');
    expect(friendRequestDto.parse({ username: ' @BiaFlor ' }).username).toBe('biaflor');
  });

  it('recusa @ fora do formato e campo extra', () => {
    expect(friendRequestDto.safeParse({ username: '@b' }).success).toBe(false);
    expect(friendRequestDto.safeParse({ username: 'bia flor' }).success).toBe(false);
    expect(friendRequestDto.safeParse({ username: 'biaflor', userId: BIA_ID }).success).toBe(false);
  });

  it('a resposta só diz enviado ou aceito', () => {
    expect(friendRequestResponseDto.parse({ outcome: 'accepted' }).outcome).toBe('accepted');
    expect(friendRequestResponseDto.safeParse({ outcome: 'blocked' }).success).toBe(false);
  });
});

describe('blockRequestDto', () => {
  it('aceita o id ou o @, nunca os dois', () => {
    expect(blockRequestDto.parse({ userId: BIA_ID })).toEqual({ userId: BIA_ID });
    expect(blockRequestDto.parse({ username: '@BiaFlor' })).toEqual({ username: 'biaflor' });
    expect(blockRequestDto.safeParse({ userId: BIA_ID, username: 'biaflor' }).success).toBe(false);
    expect(blockRequestDto.safeParse({}).success).toBe(false);
  });

  it('o param da rota exige uuid', () => {
    expect(friendUserParamsDto.safeParse({ userId: 'biaflor' }).success).toBe(false);
  });
});

describe('friendsOverviewDto', () => {
  it('lê as quatro listas com perfil e data', () => {
    const overview = {
      friends: [{ ...BIA, since: AT }],
      incoming: [{ ...BIA, at: AT }],
      outgoing: [],
      blocked: [{ ...BIA, at: AT }],
    };
    expect(friendsOverviewDto.parse(overview)).toEqual(overview);
  });

  it('recusa lista acima do teto de amigos', () => {
    const friends = Array.from({ length: FRIENDS_MAX + 1 }, () => ({ ...BIA, since: AT }));
    const overview = { friends, incoming: [], outgoing: [], blocked: [] };
    expect(friendsOverviewDto.safeParse(overview).success).toBe(false);
  });

  it('o amigo não leva e-mail', () => {
    expect(friendDto.safeParse({ ...BIA, since: AT, email: 'b@x.com' }).success).toBe(false);
  });
});

describe('tetos', () => {
  it('fixa 200 amigos, 200 bloqueados e 50 pedidos enviados', () => {
    expect([FRIENDS_MAX, BLOCKS_MAX, OUTGOING_REQUESTS_MAX]).toEqual([200, 200, 50]);
  });
});

describe('presença', () => {
  it('a visibilidade é online ou invisível; ausente é automático', () => {
    const command = { actionId: ACTION_ID, visibility: 'invisible' };
    expect(presenceSetVisibilityCommandDto.parse(command)).toEqual(command);
    const away = { actionId: ACTION_ID, visibility: 'away' };
    expect(presenceSetVisibilityCommandDto.safeParse(away).success).toBe(false);
  });

  it('o sync lista amigos com status e mesa pública', () => {
    const table = { campaignId: CAMPAIGN_ID, name: 'Mesa' };
    const ack = { ok: true, friends: [{ userId: BIA_ID, status: 'online', table }] };
    expect(presenceSyncAckDto.parse(ack)).toEqual(ack);
  });

  it('invisível nunca sai como status', () => {
    const event = { userId: BIA_ID, status: 'invisible', table: null, at: AT };
    expect(presenceFriendChangedDto.safeParse(event).success).toBe(false);
    expect(presenceFriendChangedDto.parse({ ...event, status: 'away' }).status).toBe('away');
  });

  it('friends:changed não diz o motivo', () => {
    expect(friendsChangedDto.safeParse({ at: AT, reason: 'blocked' }).success).toBe(false);
  });
});
