import type { MemberColorDto } from '@lorkarium/contracts';
import type { ProfileDto } from '@lorkarium/contracts';
import { useId } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { CustomColorTile } from '@/components/color-picker/custom-color-tile';
import { ImageSourceButtons } from '@/components/image-source-buttons';
import type { ImageSender } from '@/components/use-image-sender';
import { AVATAR_ACCEPT } from '@/lib/avatar-file';
import { diceNumberColorOf } from '@/lib/dice-number-color';
import { diceTextureUrlOf } from '@/lib/dice-texture-url';
import { memberColorCss } from '@/lib/member-color';
import type { ProfileApi } from '@/services/profile-api';
import type { SessionStore } from '@/stores/session-store';
import { accountFailureMessage } from './account-messages';
import { SettingsRow } from './settings-row';
import { failureOf, useAccountFetcher } from './use-account-fetcher';
import type { ProfileDraft } from './use-profile-draft';
import { useDiceTextureUpload, type ProfileImageUpload } from './use-profile-image-upload';

export type DiceAppearanceFieldProps = Readonly<{
  profile: ProfileDto;
  draft: ProfileDraft;
  profileApi: ProfileApi;
  sessionStore: StoreApi<SessionStore>;
}>;

/** "Seus dados": the d20 as the table will see it, in the profile color or on the texture sent.
 *  The texture is saved on its own (like the photo); the number color, only with a texture, waits
 *  in the draft for the profile bar.
 *
 *  Example: `<DiceAppearanceField profile={profile} draft={draft} profileApi={profileApi} sessionStore={sessionStore} />` */
export function DiceAppearanceField(props: DiceAppearanceFieldProps): React.JSX.Element {
  const { profile, draft } = props;
  const upload = useDiceTextureUpload(props.profileApi, props.sessionStore);
  const removal = useAccountFetcher();
  const textureId = profile.diceTextureId;
  const numberColor = diceNumberColorOf({
    color: draft.values.color,
    textureId,
    numberColor: draft.values.diceNumberColor,
  });
  return (
    <SettingsRow
      title="Seus dados"
      group
      busy={upload.sending || removal.busy}
      description="Uma textura para os seus dados · PNG, JPEG, WebP ou GIF (fica parado) até 5 MB. Sem textura, o dado usa a sua cor no mapa."
    >
      <div className="flex flex-wrap items-center gap-6">
        <DicePreview color={draft.values.color} textureId={textureId} numberColor={numberColor} />
        <div className="flex max-w-sm min-w-0 flex-1 flex-col gap-3">
          <ImageSourceButtons
            sender={textureSenderOf(upload, failureOf(removal.settled))}
            hasImage={textureId !== null}
            removeLabel="Tirar textura"
            onRemove={() => removal.send({ intent: 'dice-texture-remove' })}
          />
          {textureId !== null && (
            <NumberColorField
              value={numberColor}
              onChange={(color) => draft.change({ diceNumberColor: color })}
            />
          )}
        </div>
      </div>
    </SettingsRow>
  );
}

// The image row of the table images, over the texture's own send and the removal's refusal.
function textureSenderOf(
  upload: ProfileImageUpload,
  removalFailure: ReturnType<typeof failureOf>,
): ImageSender {
  const failure = upload.failure ?? removalFailure;
  return {
    accept: AVATAR_ACCEPT,
    busy: upload.sending,
    problem: failure ? accountFailureMessage(failure) : null,
    sendFile: (file) => {
      if (file) upload.send(file);
    },
    sendLink: upload.sendLink,
  };
}

type NumberColorFieldProps = Readonly<{ value: string; onChange: (color: string) => void }>;

function NumberColorField({ value, onChange }: NumberColorFieldProps): React.JSX.Element {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className="flex items-center gap-3">
      <CustomColorTile value={value} onPick={onChange} className="size-9" scope="account" />
      <span id={labelId} className="text-[15px] font-medium text-label">
        Cor do número
      </span>
    </div>
  );
}

type DicePreviewProps = Readonly<{
  color: MemberColorDto;
  textureId: string | null;
  numberColor: string;
}>;

const D20_OUTLINE = '50,4 90,27 90,73 50,96 10,73 10,27';
const D20_FACE = '50,24 76,68 24,68';

function DicePreview({ color, textureId, numberColor }: DicePreviewProps): React.JSX.Element {
  const patternId = `dice-texture-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const fill = textureId === null ? memberColorCss(color) : `url(#${patternId})`;
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label="Prévia do seu dado"
      className="size-32 shrink-0"
    >
      {textureId !== null && (
        <defs>
          <pattern id={patternId} patternUnits="userSpaceOnUse" width="100" height="100">
            <image
              data-testid="dice-texture"
              href={diceTextureUrlOf(textureId)}
              width="100"
              height="100"
              preserveAspectRatio="xMidYMid slice"
            />
          </pattern>
        </defs>
      )}
      <polygon
        points={D20_OUTLINE}
        fill={fill}
        stroke="black"
        strokeOpacity={0.35}
        strokeWidth={2}
      />
      <polygon
        points={D20_FACE}
        fill="none"
        stroke="black"
        strokeOpacity={0.25}
        strokeWidth={1.5}
      />
      <text
        x="50"
        y="58"
        textAnchor="middle"
        fontSize="22"
        fontWeight="700"
        fill={numberColor}
        data-testid="dice-number"
      >
        20
      </text>
    </svg>
  );
}
