import type { CampaignRoleDto, ChatSpeakerDto, TokenDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import { useTokensBesidesPose } from '@/features/board/use-board-tokens';
import { watchesOnly } from '@/lib/table-role';
import type { ChatSendFailure } from '@/services/chat-commands';
import { createBoardStore, useBoard, type BoardStore } from '@/stores/board-store';
import { useChatHistory, type ChatHistoryStore } from '@/stores/chat-history-store';
import type { ComposerVoice } from './chat-composer';
import { SpeakAsMenu } from './speak-as-menu';

type Speakable = Pick<TokenDto, 'id' | 'name' | 'initials' | 'imageAssetId' | 'frame'>;

const SELF_SPEAKER: ChatSpeakerDto = { kind: 'self' };

const NO_TOKENS: readonly Speakable[] = [];

// No grid shown yet: an empty board keeps the hook's call unconditional.
const NO_BOARD = createBoardStore('', () => undefined);

/** "Falar como" of the Table: oneself, or a token-layer character of the grid shown that the viewer controls
 *  (the server's `canControl`: the master's is every token). The choice lives in the table's chat
 *  store, so it outlasts the panel (the tab only mounts open). A token gone, or no longer
 *  controlled, puts "Você" back, as does the server answering that it is gone. Who only watches
 *  has no menu.
 *
 *  Example: `const voice = useSpeakAsVoice(table.board, table.chat, campaign.myRole)` */
export function useSpeakAsVoice(
  board: StoreApi<BoardStore> | null,
  chat: StoreApi<ChatHistoryStore>,
  role: CampaignRoleDto,
): ComposerVoice {
  const chosenId = useChatHistory(chat, (state) => state.speakAsTokenId);
  const { setSpeakAsTokenId } = chat.getState();
  const sceneId = useBoard(board ?? NO_BOARD, (state) => state.board?.scene.id ?? null);
  const tokens = useTokensBesidesPose(board ?? NO_BOARD);
  const speakable = speakableOf(tokens);
  const chosen = speakable.find((token) => token.id === chosenId) ?? null;
  const speaker: ChatSpeakerDto =
    chosen && sceneId ? { kind: 'token', sceneId, tokenId: chosen.id } : SELF_SPEAKER;
  const onRefused = (failure: ChatSendFailure) => {
    if (failure.kind === 'speaker_not_found') setSpeakAsTokenId(null);
  };
  if (watchesOnly(role)) return { speaker: SELF_SPEAKER, menu: () => null, onRefused };
  const menu = (whispering: boolean) => (
    <SpeakAsMenu
      tokens={speakable}
      chosen={chosen}
      onChoose={setSpeakAsTokenId}
      disabled={whispering}
    />
  );
  return { speaker, menu, onRefused };
}

function speakableOf(tokens: readonly TokenDto[]): readonly Speakable[] {
  if (tokens.length === 0) return NO_TOKENS;
  const byName = new Map<string, Speakable>();
  for (const token of tokens) {
    if (token.layer !== 'tokens' || !token.canControl || byName.has(token.name)) continue;
    byName.set(token.name, token);
  }
  return [...byName.values()];
}
