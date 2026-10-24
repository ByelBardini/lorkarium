/** Told after a profile change was saved (nickname, color, bio or photo), so every live table of
 *  the person hears it; implemented by the live session service (`session:memberUpdated`). */
export interface ProfileChangedPort {
  profileChanged(userId: string): Promise<void>;
}
