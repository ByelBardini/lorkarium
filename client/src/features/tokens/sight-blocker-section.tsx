import type { TokenFrameDto } from '@lorkarium/contracts';
import type { SightOutline } from '@lorkarium/game-core';
import { EyeOffIcon } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { useAssetOutline } from '@/features/board/table-sight-outlines';
import { SwitchedSection } from './reach-section';
import {
  BLOCKS_SIGHT_HINT,
  SIGHT_BLOCKER_OLD_IMAGE_NOTICE,
  SIGHT_BLOCKER_ROUND_NOTICE,
} from './token-messages';

export type SightBlockerSectionProps = Readonly<{
  on: boolean;
  onSwitch: (on: boolean) => void;
  /** The image in the form and the frame it would save: the shape they block by. */
  imageAssetId: string | null;
  frame: TokenFrameDto;
  /** The server's refusal of the limit, said here beside the switch that caused it. */
  refusal: string | null;
}>;

/** "Bloqueia a visão" of the token dialog: the switch and, while on, what the master should know of
 *  the shape: the disc of the round frame, or the rectangle of an image sent before outlines existed.
 *
 *  Example: `<SightBlockerSection on={on} onSwitch={setOn} imageAssetId={id} frame="square" refusal={null} />` */
export function SightBlockerSection(props: SightBlockerSectionProps): React.JSX.Element {
  return (
    <SwitchedSection
      icon={<EyeOffIcon aria-hidden="true" className="size-5 text-chart-2" />}
      title="Bloqueia a visão"
      hint={BLOCKS_SIGHT_HINT}
      on={props.on}
      onSwitch={props.onSwitch}
    >
      <BlockerNotice imageAssetId={props.imageAssetId} frame={props.frame} />
      {props.refusal && (
        <Alert variant="destructive" className="w-auto px-3.5 py-3 text-sm">
          {props.refusal}
        </Alert>
      )}
    </SwitchedSection>
  );
}

type BlockerNoticeProps = Pick<SightBlockerSectionProps, 'imageAssetId' | 'frame'>;

// Mounted only while on: the image is asked for here, since the room only asks for token blockers.
function BlockerNotice({ imageAssetId, frame }: BlockerNoticeProps): React.JSX.Element | null {
  const outline = useAssetOutline(frame === 'square' ? imageAssetId : null);
  const notice = noticeOf(frame, outline);
  return notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null;
}

// `undefined` is an outline not known yet: nothing to warn of until it is.
function noticeOf(frame: TokenFrameDto, outline: SightOutline | null | undefined): string | null {
  if (frame === 'round') return SIGHT_BLOCKER_ROUND_NOTICE;
  return outline === null ? SIGHT_BLOCKER_OLD_IMAGE_NOTICE : null;
}
