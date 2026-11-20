import type { FastifyInstance } from 'fastify';
import { TimerScheduler } from '../infrastructure/scheduler/timer-scheduler';
import { TimerSendPace } from '../infrastructure/send-pace/timer-send-pace';
import {
  createBroadcastsModule,
  type BroadcastsModuleOptions,
} from '../modules/broadcasts/broadcasts.plugin';

export type BroadcastsWiring = Omit<BroadcastsModuleOptions, 'scheduler' | 'pace' | 'log'>;

/** Registers the backoffice notices under `prefix` and runs the sender of their queue from the
 *  app's `onReady` until its `onClose` (the first batch one minute after the boot).
 *
 *  Example: `await wireBroadcasts(app, { db, cipher, mailer, clock, twoFactor, appPublicUrl, replyTo }, '/api')` */
export async function wireBroadcasts(
  app: FastifyInstance,
  wiring: BroadcastsWiring,
  prefix: string,
): Promise<void> {
  const scheduler = new TimerScheduler();
  const pace = new TimerSendPace();
  const broadcasts = createBroadcastsModule({ ...wiring, scheduler, pace, log: app.log });
  await app.register(broadcasts.plugin, { prefix });
  app.addHook('onReady', async () => broadcasts.sender.start());
  app.addHook('onClose', async () => {
    broadcasts.sender.close();
    scheduler.cancelAll();
  });
}
