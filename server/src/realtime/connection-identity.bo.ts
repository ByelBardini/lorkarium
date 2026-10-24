export type ConnectionCheck = 'trust-kept' | 'reread';

/** Whether a connection may go on with the identity its handshake kept, or must read the session
 *  again: before `recheckAt` nothing a read could find has changed except a logout, which drops
 *  the socket by itself. The instant comes by parameter; there is no clock here.
 *
 *  Example: `new ConnectionIdentityBo(socket.data.recheckAt).checkAt(clock.now()) // 'reread'` */
export class ConnectionIdentityBo {
  constructor(private readonly recheckAt: Date) {}

  checkAt(now: Date): ConnectionCheck {
    return now.getTime() < this.recheckAt.getTime() ? 'trust-kept' : 'reread';
  }
}
