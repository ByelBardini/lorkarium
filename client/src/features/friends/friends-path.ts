/** The rail's link to "Amigos", apart from the route so any screen may go there. */
export const FRIENDS_PATH = '/friends';

/** The conversation with one friend (below `md`, the whole screen).
 *
 *  Example: `friendPath(bia.userId) // '/friends/1b2c…'` */
export function friendPath(userId: string): string {
  return `${FRIENDS_PATH}/${userId}`;
}
