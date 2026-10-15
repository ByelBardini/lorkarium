import {
  REALTIME_PATH,
  type ApiErrorDto,
  type AuthUserDto,
  type SessionClientEvents,
  type SessionServerEvents,
} from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import { Server, type Socket } from 'socket.io';
import { isSameOrigin } from './same-origin';

/** Who a connection belongs to, set once by the handshake; never read from a payload (§7.3). */
export type RealtimeSocketData = {
  user: AuthUserDto;
  token: string;
  campaignId: string | null;
};

type NoInterServerEvents = Record<string, never>;

export type RealtimeServer = Server<
  SessionClientEvents,
  SessionServerEvents,
  NoInterServerEvents,
  RealtimeSocketData
>;

export type RealtimeSocket = Socket<
  SessionClientEvents,
  SessionServerEvents,
  NoInterServerEvents,
  RealtimeSocketData
>;

/** `null` for a missing, unknown or ended session; throws only on an unexpected failure. */
export type AuthenticateToken = (token: string | undefined) => Promise<AuthUserDto | null>;

export type RealtimeOptions = Readonly<{ authenticate: AuthenticateToken; sessionCookie: string }>;

export type Realtime = Readonly<{
  io: RealtimeServer;
  onConnection: (listener: (socket: RealtimeSocket) => void) => void;
  /** The user of the connection's cookie right now, or `null` once that session ended. */
  reauthenticate: (socket: RealtimeSocket) => Promise<AuthUserDto | null>;
}>;

const UNAUTHENTICATED: ApiErrorDto = {
  code: 'UNAUTHENTICATED',
  message: 'A valid session is required',
};

const INTERNAL_ERROR: ApiErrorDto = { code: 'INTERNAL_ERROR', message: 'Unexpected server error' };

/** Socket.IO on the Fastify server at `/api/socket.io`: same origin only, authenticated by the
 *  same HttpOnly session cookie as HTTP, and closed together with the app.
 *
 *  Example: `const realtime = attachRealtime(app, { authenticate, sessionCookie: SESSION_COOKIE })` */
export function attachRealtime(app: FastifyInstance, options: RealtimeOptions): Realtime {
  const io: RealtimeServer = new Server(app.server, {
    path: REALTIME_PATH,
    serveClient: false,
    allowRequest: (request, callback) => {
      callback(null, isSameOrigin(request.headers.origin, request.headers.host));
    },
  });
  io.use((socket, next) => {
    authenticateHandshake(app, options, socket).then(next, next);
  });
  app.addHook('preClose', async () => closeRealtime(io));
  return {
    io,
    onConnection: (listener) => io.on('connection', listener),
    reauthenticate: (socket) => options.authenticate(socket.data.token),
  };
}

async function authenticateHandshake(
  app: FastifyInstance,
  options: RealtimeOptions,
  socket: RealtimeSocket,
): Promise<Error | undefined> {
  const cookies = app.parseCookie(socket.handshake.headers.cookie ?? '');
  const token = cookies[options.sessionCookie];
  try {
    const user = await options.authenticate(token);
    if (!user || !token) return refusal(UNAUTHENTICATED);
    socket.data = { user, token, campaignId: null };
    app.log.info({ userId: user.id, socketId: socket.id }, 'realtime connection');
    return undefined;
  } catch (error) {
    app.log.error({ err: error }, 'realtime handshake failed');
    return refusal(INTERNAL_ERROR);
  }
}

// The client sees `message` as the `connect_error` text and the ApiErrorDto in `data`.
function refusal(body: ApiErrorDto): Error {
  return Object.assign(new Error(body.code), { data: body });
}

// io.close() would close app.server too, which Fastify closes itself right after.
function closeRealtime(io: RealtimeServer): void {
  io.disconnectSockets(true);
  io.engine.close();
}
