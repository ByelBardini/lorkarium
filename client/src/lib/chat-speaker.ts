import type { ChatSentSpeakerDto } from '@lorkarium/contracts';

/** The name a message is spoken with when it is a token's or a character's; `null` spoken as
 *  oneself (the author's name stands).
 *
 *  Example: `spokenNameOf(event.speaker) ?? people.nameOf(event.fromUserId)` */
export function spokenNameOf(speaker: ChatSentSpeakerDto): string | null {
  return speaker.kind === 'self' ? null : speaker.name;
}

/** One id per voice: `self`, the token's or the character's — lines of the same voice group.
 *
 *  Example: `spokenVoiceIdOf({ kind: 'character', characterId, name: 'Lyra' }) // characterId` */
export function spokenVoiceIdOf(speaker: ChatSentSpeakerDto): string {
  if (speaker.kind === 'token') return speaker.tokenId;
  if (speaker.kind === 'character') return speaker.characterId;
  return 'self';
}
