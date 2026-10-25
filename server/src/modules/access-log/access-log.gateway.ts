import { clientAddressOf } from '../../realtime/client-address';
import type { RealtimeSocket } from '../../realtime/realtime-server';
import type { AccessLogService } from './access-log.service';

/** The connection listener that records each live connection opening and closing, under the
 *  account the handshake authenticated and the IP the same trusted hops as `request.ip` give.
 *
 *  Example: `realtime.onConnection(accessLogGateway(service, env.trustProxyHops))` */
export function accessLogGateway(
  service: AccessLogService,
  trustProxyHops: number,
): (socket: RealtimeSocket) => void {
  return (socket) => {
    const { address, headers } = socket.handshake;
    const ip = clientAddressOf(address, headers['x-forwarded-for'], trustProxyHops);
    const facts = { ip, userId: socket.data.user.id };
    service.recordRealtime('realtime-connect', facts);
    socket.on('disconnect', () => service.recordRealtime('realtime-disconnect', facts));
  };
}
