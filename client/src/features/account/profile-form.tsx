import { UnsavedChangesBar } from '@/components/unsaved-changes-bar';
import type { ProfileEditor } from './use-profile-editor';

export type ProfileFormProps = Readonly<{
  /** The form's name ("Perfil", "Dados"). */
  label: string;
  editor: ProfileEditor;
  children: React.ReactNode;
}>;

/** A form over the shared profile draft, with the unsaved-changes bar pinned at its bottom.
 *
 *  Example: `<ProfileForm label="Dados" editor={editor}><DiceAppearanceField … /></ProfileForm>` */
export function ProfileForm({ label, editor, children }: ProfileFormProps): React.JSX.Element {
  const { draft, save } = editor;
  return (
    <form
      noValidate
      aria-label={label}
      aria-busy={save.saving}
      onSubmit={save.submit}
      className="flex flex-col gap-6"
    >
      {children}
      {save.barState && (
        <UnsavedChangesBar
          label="Alterações do perfil"
          className="-mx-4 sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12"
          state={save.barState}
          invalid={draft.update === null}
          failureMessage={save.failureMessage}
          onDiscard={draft.discard}
        />
      )}
    </form>
  );
}
