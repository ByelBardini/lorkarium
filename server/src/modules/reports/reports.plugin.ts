import { USER_REPORTS_PAGE_SIZE } from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { UsersDao } from '../auth/users.dao';
import { ReportsDao } from './reports.dao';
import { reportsRoutes } from './reports.routes';
import { ReportsService } from './reports.service';

export type ReportsModuleOptions = Readonly<{ db: Database }>;

export type ReportsModule = Readonly<{ plugin: (app: FastifyInstance) => Promise<void> }>;

/** Wires the reports: DAO, service and the HTTP edge (the user's route and the backoffice queue).
 *  Needs `app.authGuards`.
 *
 *  Example: `await app.register(createReportsModule({ db }).plugin, { prefix: '/api' })` */
export function createReportsModule(options: ReportsModuleOptions): ReportsModule {
  const service = new ReportsService({
    reports: new ReportsDao(options.db),
    accounts: new UsersDao(options.db),
    pageSize: USER_REPORTS_PAGE_SIZE,
  });
  return { plugin: reportsRoutes(service) };
}
