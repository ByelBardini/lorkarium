import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import type { ClockPort } from '../auth/clock.port';
import type { SchedulerPort } from '../sessions/scheduler.port';
import { HousekeepingDao } from './housekeeping.dao';
import { HousekeepingService } from './housekeeping.service';

export type HousekeepingModuleOptions = Readonly<{
  db: Database;
  clock: ClockPort;
  scheduler: SchedulerPort;
}>;

/** The hourly cleanup of the tables that only grow, started with the app and stopped on close.
 *
 *  Example: `wireHousekeeping(app, { db, clock, scheduler: new TimerScheduler() })` */
export function wireHousekeeping(
  app: FastifyInstance,
  options: HousekeepingModuleOptions,
): HousekeepingService {
  const service = new HousekeepingService({
    dao: new HousekeepingDao(options.db),
    clock: options.clock,
    scheduler: options.scheduler,
    log: app.log,
  });
  app.addHook('onReady', async () => service.start());
  app.addHook('onClose', async () => service.close());
  return service;
}
