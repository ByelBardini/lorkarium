import {
  SCENE_NAME_MAX_LENGTH,
  type LibrarySceneDto,
  type UpdateLibrarySceneRequestDto,
} from '@lorkarium/contracts';
import { ArrowRightIcon, PencilIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { SegmentField, type SegmentOption } from '@/components/segment-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDraftField } from '@/lib/use-draft-field';
import { DeleteConfirmDialog } from './delete-scene-dialog';
import { liveLabel, sceneDeletionText, sceneMeta } from './library-messages';
import { SceneThumbnail } from './scene-thumbnail';
import type { LibrarySubmit } from './use-library-submit';

type Visibility = LibrarySceneDto['visibility'];

const VISIBILITY_OPTIONS: readonly SegmentOption<Visibility>[] = [
  { value: 'private', label: 'Privado' },
  { value: 'public', label: 'Público' },
];

const VISIBILITY_HINT: Readonly<Record<Visibility, string>> = {
  private: 'Só você vê. Pra preparar sem spoiler.',
  public: 'Jogadores veem e podem espiar.',
};

export type SceneDetailsProps = Readonly<{
  scene: LibrarySceneDto | null;
  isMaster: boolean;
  /** The table is live: commands may go (reconnecting disables them). */
  live: boolean;
  groupSceneId: string | null;
  playersOnline: number;
  now: Date;
  /** The name field takes the focus (a grid just created). */
  focusName: boolean;
  submit: LibrarySubmit;
  onOpen: (sceneId: string) => void;
}>;

/** The panel of the grid picked: the master edits the name and who sees it (the folder changes by dragging it in the tree), takes the
 *  group there, opens, duplicates or deletes it; a player only opens it.
 *
 *  Example: `<SceneDetails scene={picked} isMaster live … />` */
export function SceneDetails(props: SceneDetailsProps): React.JSX.Element {
  const { scene } = props;
  return (
    <section
      aria-label="Grid escolhido"
      className="flex min-h-0 flex-col gap-5 overflow-y-auto border-l border-border bg-panel p-5"
    >
      {scene ? <PickedScene {...props} scene={scene} /> : <NothingPicked />}
    </section>
  );
}

function NothingPicked(): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
      <span className="font-display text-[22px] font-semibold text-label">
        Nenhum grid escolhido
      </span>
      <span className="text-[13px]">Clica num grid pra ver os detalhes.</span>
    </div>
  );
}

type PickedProps = SceneDetailsProps & Readonly<{ scene: LibrarySceneDto }>;

function PickedScene(props: PickedProps): React.JSX.Element {
  const { scene, isMaster } = props;
  const isGroup = scene.id === props.groupSceneId;
  return (
    <>
      <div className="overflow-hidden rounded-md border border-divider">
        <SceneThumbnail scene={scene} live={isGroup} liveText={liveLabel(props.playersOnline)} />
      </div>
      {isMaster ? (
        <MasterFields key={scene.id} {...props} />
      ) : (
        <div className="flex flex-col gap-1">
          <span className="font-display text-xl font-semibold">{scene.name}</span>
          <span className="text-xs text-muted-foreground">{sceneMeta(scene, props.now)}</span>
        </div>
      )}
      {isMaster ? (
        <MasterActions {...props} isGroup={isGroup} />
      ) : (
        <Button className="mt-auto" onClick={() => props.onOpen(scene.id)}>
          Abrir
        </Button>
      )}
    </>
  );
}

function MasterFields(props: PickedProps): React.JSX.Element {
  const { scene, submit, live } = props;
  const update = (changes: UpdateLibrarySceneRequestDto): Promise<void> =>
    submit({ intent: 'updateScene', sceneId: scene.id, changes });
  return (
    <>
      <NameField {...props} />
      <SegmentField
        legend="Quem vê na biblioteca"
        value={scene.visibility}
        fill
        options={VISIBILITY_OPTIONS.map((option) => ({ ...option, disabled: !live }))}
        hint={VISIBILITY_HINT[scene.visibility]}
        onChange={(visibility) => visibility !== scene.visibility && void update({ visibility })}
      />
    </>
  );
}

function NameField({ scene, submit, live, now, focusName }: PickedProps): React.JSX.Element {
  const id = useId();
  const binding = useDraftField({
    confirmed: scene.name,
    save: async (draft) => {
      const name = draft.trim();
      if (name === '') return false;
      await submit({ intent: 'updateScene', sceneId: scene.id, changes: { name } });
      return true;
    },
  });
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-xs font-semibold tracking-[0.06em] text-label uppercase">
        Nome
      </label>
      <Input
        id={id}
        {...binding}
        autoFocus={focusName}
        disabled={!live}
        maxLength={SCENE_NAME_MAX_LENGTH}
        className="h-10 font-display text-[19px] font-semibold"
      />
      <span className="text-xs text-muted-foreground">{sceneMeta(scene, now)}</span>
    </div>
  );
}

function MasterActions(props: PickedProps & Readonly<{ isGroup: boolean }>): React.JSX.Element {
  const { scene, submit, live, isGroup } = props;
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="mt-auto flex flex-col gap-2">
      {scene.visibility === 'private' && !isGroup && (
        <p className="rounded-md bg-primary/10 px-3 py-2.5 text-xs leading-relaxed text-label">
          Levar o grupo mostra o mapa pra quem estiver lá, mas o grid continua fora da biblioteca
          deles.
        </p>
      )}
      <Button
        size="lg"
        disabled={isGroup || !live}
        onClick={() => void submit({ intent: 'activateScene', sceneId: scene.id })}
      >
        <ArrowRightIcon aria-hidden="true" />
        {isGroup ? 'O grupo está aqui' : 'Levar o grupo pra cá'}
      </Button>
      <Button variant="outline" onClick={() => props.onOpen(scene.id)}>
        <PencilIcon aria-hidden="true" />
        Abrir pra preparar
      </Button>
      <div className="flex gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1"
          disabled={!live}
          onClick={() => void submit({ intent: 'duplicateScene', sceneId: scene.id })}
        >
          Duplicar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 text-destructive-text"
          disabled={isGroup || !live}
          onClick={() => setConfirming(true)}
        >
          Excluir
        </Button>
      </div>
      {isGroup && (
        <span className="text-center text-xs text-muted-foreground">
          Leva o grupo pra outro grid antes de excluir este.
        </span>
      )}
      {confirming && (
        <DeleteConfirmDialog
          title={`Excluir ${scene.name}?`}
          description={sceneDeletionText(scene.tokenCount)}
          onConfirm={() => void submit({ intent: 'removeScene', sceneId: scene.id })}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
