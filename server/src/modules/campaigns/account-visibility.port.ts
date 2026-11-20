/** Whether an account shows as online to people who are not at its table: false while it is
 *  invisible or offline. "Explorar mesas" reads it, so an invisible master does not show online. */
export interface AccountVisibilityPort {
  isVisiblyOnline(userId: string): boolean;
}
