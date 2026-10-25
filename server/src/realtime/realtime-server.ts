import {
  REALTIME_COMPRESSION_THRESHOLD_BYTES,
  REALTIME_MESSAGE_MAX_BYTES,
  REALTIME_PATH,
  type ApiErrorDto,
  type AuthUserDto,
  type TableClientEvents,
  type TableServerEvents,
} from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import { Server, type ServerOptions, type Socket } from 'socket.io';
import { ConnectionIdentityBo } from './connection-identity.bo';
import { isSameOrigin } from './same-origin';

/** Who a connection belongs to, set by the handshake; never read from a payload (§7.3). The
 *  session is read again only from `recheckAt` on (see `ConnectionIdentityBo`). */
export type RealtimeSocketData = {
  user: AuthUserDto;
  token: string;
  sessionId: string;
  recheckAt: Date;
  campaignIds: ReadonlySet<string>;
  /** The extra grid tabs of each open table (`scene:watch`), by campaign id; the group grid is
   *  not one of them unless it was watched too. */
  watchedSceneIds: ReadonlyMap<string, ReadonlySet<string>>;
};

type NoInterServerEvents = Record<string, never>;

export type RealtimeServer = Server<
  TableClientEvents,
  TableServerEvents,
  NoInterServerEvents,
  RealtimeSocketData
>;

export type RealtimeSocket = Socket<
  TableClientEvents,
  TableServerEvents,
  NoInterServerEvents,
  RealtimeSocketData
>;

/** The session behind a cookie, as the connection keeps it. */
export type ConnectionIdentity = Readonly<{
  user: AuthUserDto;
  sessionId: string;
  recheckAt: Date;
}>;

/** `null` for a missing, unknown or ended session; throws only on an unexpected failure. */
export type AuthenticateToken = (token: string | undefined) => Promise<ConnectionIdentity | null>;

export type RealtimeOptions = Readonly<{
  authenticate: AuthenticateToken;
  sessionCookie: string;
  clock: Readonly<{ now: () => Date }>;
}>;

export type Realtime = Readonly<{
  io: RealtimeServer;
  onConnection: (listener: (socket: RealtimeSocket) => void) => void;
  /** The user of the connection right now, or `null` once that session ended. */
  reauthenticate: (socket: RealtimeSocket) => Promise<AuthUserDto | null>;
  /** Drops every connection of the session (logout); other sessions of the user go on. */
  endSession: (sessionId: string) => void;
}>;

const UNAUTHENTICATED: ApiErrorDto = {
  code: 'UNAUTHENTICATED',
  message: 'A valid session is required',
};

const INTERNAL_ERROR: ApiErrorDto = { code: 'INTERNAL_ERROR', message: 'Unexpected server error' };

/** Socket.IO on the Fastify server at `/api/socket.io`: same origin only, authenticated by the
 *  same HttpOnly session cookie as HTTP, and closed together with the app.
 *
 *  Example: `const realtime = attachRealtime(app, { authenticate, sessionCookie: SESSION_COOKIE, clock })` */
export function attachRealtime(app: FastifyInstance, options: RealtimeOptions): Realtime {
  const io: RealtimeServer = new Server(app.server, {
    ...realtimeServerOptions(),
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
    reauthenticate: (socket) => reauthenticate(options, socket),
    endSession: (sessionId) => endSession(io, sessionId),
  };
}

/** The Socket.IO options that follow the contract limits: compression only from 4 KB on (the
 *  snapshot, big pastes; never the drag preview) and a buffer that takes the largest valid
 *  command instead of dropping the connection on it.
 *
 *  Example: `new Server(httpServer, { ...realtimeServerOptions(), allowRequest })` */
export function realtimeServerOptions(): Partial<ServerOptions> {
  return {
    path: REALTIME_PATH,
    serveClient: false,
    perMessageDeflate: { threshold: REALTIME_COMPRESSION_THRESHOLD_BYTES },
    maxHttpBufferSize: REALTIME_MESSAGE_MAX_BYTES,
  };
}

async function reauthenticate(
  options: RealtimeOptions,
  socket: RealtimeSocket,
): Promise<AuthUserDto | null> {
  const check = new ConnectionIdentityBo(socket.data.recheckAt).checkAt(options.clock.now());
  if (check === 'trust-kept') return socket.data.user;
  const identity = await options.authenticate(socket.data.token);
  if (!identity) return null;
  // Field by field: a gateway may have set campaignIds while the session was read.
  socket.data.user = identity.user;
  socket.data.recheckAt = identity.recheckAt;
  return identity.user;
}

function endSession(io: RealtimeServer, sessionId: string): void {
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.sessionId === sessionId) socket.disconnect(true);
  }
}

async function authenticateHandshake(
  app: FastifyInstance,
  options: RealtimeOptions,
  socket: RealtimeSocket,
): Promise<Error | undefined> {
  const cookies = app.parseCookie(socket.handshake.headers.cookie ?? '');
  const token = cookies[options.sessionCookie];
  try {
    const identity = await options.authenticate(token);
    if (!identity || !token) return refusal(UNAUTHENTICATED);
    const { user, sessionId, recheckAt } = identity;
    socket.data = {
      user,
      token,
      sessionId,
      recheckAt,
      campaignIds: new Set(),
      watchedSceneIds: new Map(),
    };
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

// Only the transports: on "transport close" the client retries until the next server is up (a
// deploy), while a Socket.IO disconnect ("io server disconnect") would leave it offline for good.
// io.close() would close app.server too, which Fastify closes itself right after.
function closeRealtime(io: RealtimeServer): void {
  io.engine.close();
}
