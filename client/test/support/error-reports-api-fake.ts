import type {
  ErrorReportingSettings,
  ErrorReportsApi,
  ServerTestOutcome,
} from '@/services/error-reports-api';

/** Answers the settings and the server test it was given; `holdServerTest()` keeps the test
 *  pending until `releaseServerTest()`. */
export class ErrorReportsApiFake implements ErrorReportsApi {
  settingsAnswer: ErrorReportingSettings | null = null;
  serverTestAnswer: ServerTestOutcome = 'server-error';
  serverTests = 0;
  private held: (() => void) | null = null;
  private holding = false;

  settings(): Promise<ErrorReportingSettings | null> {
    return Promise.resolve(this.settingsAnswer);
  }

  triggerServerTest(): Promise<ServerTestOutcome> {
    this.serverTests += 1;
    if (!this.holding) return Promise.resolve(this.serverTestAnswer);
    return new Promise((resolve) => {
      this.held = () => resolve(this.serverTestAnswer);
    });
  }

  holdServerTest(): this {
    this.holding = true;
    return this;
  }

  releaseServerTest(): void {
    this.held?.();
  }
}
