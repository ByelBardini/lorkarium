import type { TokenDto } from '@lorkarium/contracts';
import { Fragment } from 'react';
import { ChevronDownIcon, DramaIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TokenFace } from '@/features/tokens/token-face';

// The radio value of "Você": a token or character id never is this.
const SELF = 'self';

/** What the menu shows of a voice, a token's or a character's (they share these fields). */
export type SpeakAsFace = Pick<TokenDto, 'id' | 'name' | 'initials' | 'imageAssetId' | 'frame'>;

export type SpeakAsMenuProps = Readonly<{
  /** The characters the viewer controls, on a grid or not. */
  characters: readonly SpeakAsFace[];
  /** The tokens of the grid shown that are no listed character's. */
  tokens: readonly SpeakAsFace[];
  chosen: SpeakAsFace | null;
  onChoose: (voiceId: string | null) => void;
  /** A whisper is the person's: a character speaks only to the whole Table. */
  disabled: boolean;
}>;

/** The "Falar como" button and its menu: "Você", the characters and the grid's tokens, in the
 *  display italic.
 *
 *  Example: `<SpeakAsMenu characters={mine} tokens={speakable} chosen={null} onChoose={setChosenId} disabled={false} />` */
export function SpeakAsMenu({ characters, tokens, chosen, onChoose, disabled }: SpeakAsMenuProps) {
  const shown = chosen?.name ?? 'Você';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Falar como: ${shown}`}
          className={chosen ? 'border-primary/60 text-primary' : undefined}
        >
          {chosen ? <CharacterFace token={chosen} /> : <DramaIcon aria-hidden="true" />}
          <span className={chosen ? 'max-w-32 truncate font-display italic' : undefined}>
            {shown}
          </span>
          <ChevronDownIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60" align="start" side="top">
        <DropdownMenuRadioGroup
          value={chosen?.id ?? SELF}
          onValueChange={(value) => onChoose(value === SELF ? null : value)}
        >
          <DropdownMenuRadioItem value={SELF}>Você</DropdownMenuRadioItem>
          <VoiceSection label="Personagens" faces={characters} />
          <VoiceSection label="Tokens do grid" faces={tokens} />
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function VoiceSection({
  label,
  faces,
}: Readonly<{ label: string; faces: readonly SpeakAsFace[] }>): React.JSX.Element | null {
  if (faces.length === 0) return null;
  return (
    <Fragment>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>{label}</DropdownMenuLabel>
      {faces.map((face) => (
        <DropdownMenuRadioItem key={face.id} value={face.id}>
          <CharacterFace token={face} />
          <span className="font-display text-[15px] italic">{face.name}</span>
        </DropdownMenuRadioItem>
      ))}
    </Fragment>
  );
}

function CharacterFace({ token }: Readonly<{ token: SpeakAsFace }>): React.JSX.Element {
  return (
    <TokenFace
      initials={token.initials}
      imageAssetId={token.imageAssetId}
      round={token.frame === 'round'}
      className="grid size-5 place-items-center bg-muted font-display text-[10px] font-semibold"
    />
  );
}
