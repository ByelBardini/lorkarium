import type { CampaignRoleDto, CharacterDto, ChatSpeakerDto, TokenDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import { useTokensBesidesPose } from '@/features/board/use-board-tokens';
import { watchesOnly } from '@/lib/table-role';
import type { ChatSendFailure } from '@/services/chat-commands';
import { createBoardStore, useBoard, type BoardStore } from '@/stores/board-store';
import { useChatHistory, type ChatHistoryStore } from '@/stores/chat-history-store';
import { useCharacters, type CharactersStore } from '@/stores/characters-store';
import type { ComposerVoice } from './chat-composer';
import { SpeakAsMenu, type SpeakAsFace } from './speak-as-menu';

const SELF_SPEAKER: ChatSpeakerDto = { kind: 'self' };

const NO_FACES: readonly SpeakAsFace[] = [];

// No grid shown yet: an empty board keeps the hook's call unconditional.
const NO_BOARD = createBoardStore('', () => undefined);

/** The stores "Falar como" reads: the grid shown (its tokens) and the table's characters. */
export type SpeakAsSources = Readonly<{
  board: StoreApi<BoardStore> | null;
  characters: StoreApi<CharactersStore>;
}>;

/** "Falar como" of the Table: oneself, a character the viewer controls (on a grid or not), or a
 *  token-layer token of the grid shown that the viewer controls and that is no character's (the
 *  server's `canControl`: the master's is every one). A token linked to a listed character speaks
 *  as that character. The choice lives in the table's chat store, so it outlasts the panel (the
 *  tab only mounts open). A voice gone, or no longer controlled, puts "Você" back, as does the
 *  server answering that it is gone. Who only watches has no menu.
 *
 *  Example: `const voice = useSpeakAsVoice({ board, characters: table.characters }, table.chat, campaign.myRole)` */
export function useSpeakAsVoice(
  sources: SpeakAsSources,
  chat: StoreApi<ChatHistoryStore>,
  role: CampaignRoleDto,
): ComposerVoice {
  const chosenId = useChatHistory(chat, (state) => state.speakAsId);
  const { setSpeakAsId } = chat.getState();
  const board = sources.board ?? NO_BOARD;
  const sceneId = useBoard(board, (state) => state.board?.scene.id ?? null);
  const tokens = useTokensBesidesPose(board);
  const characters = speakableCharactersOf(
    useCharacters(sources.characters, (state) => state.characters),
  );
  const speakable = speakableTokensOf(tokens, characters);
  const chosen = chosenVoiceOf(chosenId, characters, speakable, tokens);
  const speaker = speakerOf(chosen, sceneId);
  const onRefused = (failure: ChatSendFailure) => {
    if (failure.kind === 'speaker_not_found') setSpeakAsId(null);
  };
  if (watchesOnly(role)) return { speaker: SELF_SPEAKER, menu: () => null, onRefused };
  const menu = (whispering: boolean) => (
    <SpeakAsMenu
      characters={characters}
      tokens={speakable}
      chosen={chosen?.face ?? null}
      onChoose={setSpeakAsId}
      disabled={whispering}
    />
  );
  return { speaker, menu, onRefused };
}

type ChosenVoice = Readonly<{ kind: 'token' | 'character'; face: SpeakAsFace }>;

function speakerOf(chosen: ChosenVoice | null, sceneId: string | null): ChatSpeakerDto {
  if (chosen?.kind === 'character') return { kind: 'character', characterId: chosen.face.id };
  if (chosen?.kind === 'token' && sceneId) {
    return { kind: 'token', sceneId, tokenId: chosen.face.id };
  }
  return SELF_SPEAKER;
}

// A token chosen before it was linked (or by its id) speaks as its character.
function chosenVoiceOf(
  chosenId: string | null,
  characters: readonly SpeakAsFace[],
  speakable: readonly SpeakAsFace[],
  tokens: readonly TokenDto[],
): ChosenVoice | null {
  if (chosenId === null) return null;
  const token = speakable.find((face) => face.id === chosenId);
  if (token) return { kind: 'token', face: token };
  const linkedId = tokens.find((each) => each.id === chosenId)?.characterId ?? chosenId;
  const character = characters.find((face) => face.id === linkedId);
  return character ? { kind: 'character', face: character } : null;
}

function speakableCharactersOf(characters: readonly CharacterDto[]): readonly SpeakAsFace[] {
  const controlled = characters.filter((character) => character.canControl);
  return controlled.length === 0 ? NO_FACES : controlled;
}

function speakableTokensOf(
  tokens: readonly TokenDto[],
  characters: readonly SpeakAsFace[],
): readonly SpeakAsFace[] {
  if (tokens.length === 0) return NO_FACES;
  const characterIds = new Set(characters.map((character) => character.id));
  const byName = new Map<string, SpeakAsFace>();
  for (const token of tokens) {
    if (token.layer !== 'tokens' || !token.canControl || byName.has(token.name)) continue;
    if (token.characterId !== null && characterIds.has(token.characterId)) continue;
    byName.set(token.name, token);
  }
  return [...byName.values()];
}
