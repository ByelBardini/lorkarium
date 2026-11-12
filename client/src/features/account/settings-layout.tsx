export type SettingsLayoutProps = Readonly<{
  /** The rows of settings, on the left. */
  children: React.ReactNode;
  /** What sums the rows up (the preview, the protection of the account), on the right. */
  aside: React.ReactNode;
}>;

/** The two columns of a tab of "Minha conta": the rows take the larger share of the width, the
 *  aside the rest. From `xl` a line runs the whole height between them and the aside holds the
 *  middle of the screen while the rows scroll; below, the aside goes under the rows.
 *
 *  Example: `<SettingsLayout aside={<ProfilePreview … />}><NicknameRow … /></SettingsLayout>` */
export function SettingsLayout({ children, aside }: SettingsLayoutProps): React.JSX.Element {
  return (
    <div className="grid gap-12 xl:grid-cols-[minmax(0,1.6fr)_minmax(340px,1fr)]">
      <div className="flex min-w-0 flex-col">{children}</div>
      <div className="border-t border-divider pt-8 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-10">
        {/* The screen's height, capped by the column's: centered while it sticks. */}
        <div className="xl:sticky xl:top-0 xl:flex xl:h-full xl:max-h-dvh xl:flex-col xl:justify-center">
          {aside}
        </div>
      </div>
    </div>
  );
}
