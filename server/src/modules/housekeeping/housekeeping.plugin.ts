import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import type { ClockPort } from '../auth/clock.port';
import { createFeedbackRetention } from '../feedback/feedback.plugin';
import { createReportRetention } from '../reports/reports.plugin';
import type { SchedulerPort } from '../sessions/scheduler.port';
import { HousekeepingDao } from './housekeeping.dao';
import { HousekeepingService } from './housekeeping.service';
import type { SuspensionEndedPort } from './suspension-ended.port';

export type HousekeepingModuleOptions = Readonly<{
  db: Database;
  clock: ClockPort;
  scheduler: SchedulerPort;
  /** Tells an account its suspension reached its end (`SuspensionEndedNoticeService`). */
  suspensionEnded: SuspensionEndedPort;
}>;

/** The hourly cleanup of the tables that only grow, started with the app and stopped on close.
 *
 *  Example: `wireHousekeeping(app, { db, clock, scheduler: new TimerScheduler(), suspensionEnded })` */
export function wireHousekeeping(
  app: FastifyInstance,
  options: HousekeepingModuleOptions,
): HousekeepingService {
  const dao = new HousekeepingDao(options.db);
  const service = new HousekeepingService({
    dao,
    expired: dao,
    suspensionEnded: options.suspensionEnded,
    reportRetention: createReportRetention(options.db, options.clock),
    feedbackRetention: createFeedbackRetention(options.db, options.clock),
    clock: options.clock,
    scheduler: options.scheduler,
    log: app.log,
  });
  app.addHook('onReady', async () => service.start());
  app.addHook('onClose', async () => service.close());
  return service;
}
