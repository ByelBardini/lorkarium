import type { BadgeDto, ProfileCardDto } from '@lorkarium/contracts';
import { ANA } from './auth-api-fake';

/** "Veterano", the first badge of the catalog. */
export const VETERANO_BADGE: BadgeDto = {
  id: '3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a',
  name: 'Veterano',
  description: 'Jogou 100 sessões',
  imageId: '6e5d4c3b-2a19-4f08-8e7d-6c5b4a392817',
};

/** `count` badges in catalog order ("Insígnia 1", "Insígnia 2", …), each with its own image.
 *
 *  Example: `lyraCard({ badges: badgesOf(8) })` */
export function badgesOf(count: number): BadgeDto[] {
  return Array.from({ length: count }, (_, index) => {
    const tail = String(index + 1).padStart(12, '0');
    return {
      id: `00000000-0000-4000-8000-${tail}`,
      name: `Insígnia ${index + 1}`,
      description: `Descrição ${index + 1}`,
      imageId: `11111111-1111-4111-8111-${tail}`,
    };
  });
}

/** Lyra's card as Ana reads it: friends, online, Apoiador, no banner image, 128 up and 4 down
 *  (97%), two tables in common, every preference written. */
export const LYRA_CARD: ProfileCardDto = {
  id: '5d8c1f2a-3b4e-4c6d-8e9f-0a1b2c3d4e5f',
  username: 'lyravalen',
  name: 'Lyra Valen',
  color: 'violet',
  avatarId: null,
  bannerId: null,
  bio: 'Amo intriga política e um bom combate tático.',
  memberSince: '2025-01-05T12:00:00.000Z',
  plan: 'apoiador',
  admin: false,
  lorkariumOwner: false,
  presence: 'online',
  relation: 'friend',
  rollsCount: 4812,
  natural20Count: 241,
  campaignsAsMaster: 2,
  campaignsAsPlayer: 5,
  reputation: { up: 128, down: 4, myVote: null, percent: 97 },
  gameSystems: 'D&D 5e e sistemas próprios.',
  playSchedule: 'Tarde e noite.',
  contact: 'Discord: lyra.valen',
  mutualCampaigns: [
    { id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', name: 'A Queda de Varn' },
    { id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e', name: 'Ruínas de Kael' },
  ],
  mutualFriends: 5,
  badges: [],
};

/** Lyra's card with some fields changed.
 *
 *  Example: `lyraCard({ plan: 'free', presence: null })` */
export function lyraCard(overrides: Partial<ProfileCardDto> = {}): ProfileCardDto {
  return { ...LYRA_CARD, ...overrides };
}

/** Ana's own card (`relation: 'self'`). */
export const ANA_CARD: ProfileCardDto = lyraCard({
  id: ANA.id,
  username: ANA.username,
  name: ANA.name,
  relation: 'self',
  presence: null,
  plan: 'free',
});

/** Bia's card as Ana reads it: no relation, no table in common; found by her @ "bia". */
export const BIA_CARD: ProfileCardDto = lyraCard({
  id: '8b7a6c5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d',
  username: 'bia',
  name: 'Bia',
  relation: 'none',
  presence: null,
  mutualCampaigns: [],
  mutualFriends: 0,
});
