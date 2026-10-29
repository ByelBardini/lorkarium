import type { TokenDto } from '@lorkarium/contracts';
import { ChevronDownIcon, DramaIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TokenFace } from '@/features/tokens/token-face';

// The radio value of "Você": a token id never is this.
const SELF = 'self';

type MenuToken = Pick<TokenDto, 'id' | 'name' | 'initials' | 'imageAssetId' | 'frame'>;

export type SpeakAsMenuProps = Readonly<{
  tokens: readonly MenuToken[];
  chosen: MenuToken | null;
  onChoose: (tokenId: string | null) => void;
  /** A whisper is the person's: a character speaks only to the whole Table. */
  disabled: boolean;
}>;

/** The "Falar como" button and its menu: "Você" and the characters, in the display italic.
 *
 *  Example: `<SpeakAsMenu tokens={speakable} chosen={null} onChoose={setChosenId} disabled={false} />` */
export function SpeakAsMenu({ tokens, chosen, onChoose, disabled }: SpeakAsMenuProps) {
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
          {tokens.length > 0 && <DropdownMenuLabel>Personagens</DropdownMenuLabel>}
          {tokens.map((token) => (
            <DropdownMenuRadioItem key={token.id} value={token.id}>
              <CharacterFace token={token} />
              <span className="font-display text-[15px] italic">{token.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CharacterFace({ token }: Readonly<{ token: MenuToken }>): React.JSX.Element {
  return (
    <TokenFace
      initials={token.initials}
      imageAssetId={token.imageAssetId}
      round={token.frame === 'round'}
      className="grid size-5 place-items-center bg-muted font-display text-[10px] font-semibold"
    />
  );
}
