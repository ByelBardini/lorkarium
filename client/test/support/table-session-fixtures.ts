import type {
  SessionMemberDto,
  SessionMemberJoinedDto,
  SessionMemberLeftDto,
  SessionStateDto,
} from '@lorkarium/contracts';
import { ANA } from './auth-api-fake';
import { VHARN } from './campaigns-api-fake';

export const ANA_AT_TABLE: SessionMemberDto = {
  userId: ANA.id,
  name: 'Ana',
  role: 'master',
  online: true,
};

export const BIA_AT_TABLE: SessionMemberDto = {
  userId: '9c2f4e61-7a3b-4d5c-8e9f-0b1a2c3d4e5f',
  name: 'Bia',
  role: 'player',
  online: false,
};

export const CAIO_AT_TABLE: SessionMemberDto = {
  userId: 'b4d6e8f0-1a2b-4c3d-8e5f-6a7b8c9d0e1f',
  name: 'Caio',
  role: 'player',
  online: true,
};

const AT = '2026-10-15T12:00:00.000Z';

/** The VHARN snapshot: Ana and Caio online, Bia offline, unless overridden.
 *
 *  Example: `vharnState({ version: 3 })` */
export function vharnState(overrides: Partial<SessionStateDto> = {}): SessionStateDto {
  return {
    campaignId: VHARN.id,
    version: 1,
    members: [ANA_AT_TABLE, BIA_AT_TABLE, CAIO_AT_TABLE],
    at: AT,
    ...overrides,
  };
}

/** `session:memberJoined` of Bia at VHARN.
 *
 *  Example: `biaJoined({ version: 2 })` */
export function biaJoined(overrides: Partial<SessionMemberJoinedDto> = {}): SessionMemberJoinedDto {
  return {
    campaignId: VHARN.id,
    version: 2,
    member: { ...BIA_AT_TABLE, online: true },
    at: AT,
    ...overrides,
  };
}

/** `session:memberLeft` of Bia at VHARN.
 *
 *  Example: `biaLeft({ version: 3 })` */
export function biaLeft(overrides: Partial<SessionMemberLeftDto> = {}): SessionMemberLeftDto {
  return { campaignId: VHARN.id, version: 3, userId: BIA_AT_TABLE.userId, at: AT, ...overrides };
}
