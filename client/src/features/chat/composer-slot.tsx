import type { CampaignRoleDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import type { ChatConversation } from '@/lib/chat-conversations';
import { watchesOnly } from '@/lib/table-role';
import type { BoardStore } from '@/stores/board-store';
import { useDiceRoller } from '@/features/dice/use-dice-roller';
import { useSavedRolls } from '@/features/dice/use-saved-rolls';
import { ChatComposer, type ComposerVoice } from './chat-composer';
import type { ChatServices } from './chat-panel';
import { useSpeakAsVoice } from './use-speak-as-voice';
import type { ChatPeople } from './use-chat-people';
import type { ComposerTools } from './use-chat-composer';

export type ComposerSlotProps = Readonly<{
  campaignId: string;
  role: CampaignRoleDto;
  services: ChatServices;
  /** The grid shown: "Falar como" lists its tokens. */
  board: StoreApi<BoardStore> | null;
  conversation: ChatConversation;
  people: ChatPeople;
  live: boolean;
}>;

const NO_TOOLS: ComposerTools = { canRoll: false, savedRolls: [], roller: null };

/** The composer of the conversation shown, with what the viewer's role allows: who plays rolls
 *  (their saved rolls listed once) and speaks as a token, both kept across conversations; who
 *  only watches talks.
 *
 *  Example: `<ComposerSlot campaignId={id} role="player" services={deps} board={board} conversation={shown} people={people} live />` */
export function ComposerSlot(props: ComposerSlotProps): React.JSX.Element {
  const voice = useSpeakAsVoice(props.board, props.role);
  if (watchesOnly(props.role)) return <KeyedComposer {...props} tools={NO_TOOLS} voice={voice} />;
  return <RollingComposer {...props} voice={voice} />;
}

type VoicedProps = ComposerSlotProps & Readonly<{ voice: ComposerVoice }>;

function RollingComposer(props: VoicedProps): React.JSX.Element {
  const saved = useSavedRolls(props.campaignId, props.services.savedRolls);
  const roller = useDiceRoller(props.campaignId, props.services.dice);
  const tools: ComposerTools = { canRoll: true, savedRolls: saved.rolls ?? [], roller };
  return <KeyedComposer {...props} tools={tools} />;
}

// Another conversation is another draft and another "Pra quem".
function KeyedComposer(props: VoicedProps & Readonly<{ tools: ComposerTools }>) {
  const { campaignId, services, conversation } = props;
  return (
    <ChatComposer
      key={conversation.key}
      target={conversation.target}
      people={props.people}
      live={props.live}
      send={(request) => services.chat.send(campaignId, request)}
      tools={props.tools}
      voice={props.voice}
    />
  );
}
