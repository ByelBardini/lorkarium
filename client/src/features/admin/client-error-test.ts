/** Thrown on purpose by "Gerar erro no navegador": the issue it opens in Sentry says so.
 *
 *  Example: `setTimeout(() => { throw new ClientErrorTest(); })` */
export class ClientErrorTest extends Error {
  constructor() {
    super('error report test thrown in the browser by the backoffice');
    this.name = 'ClientErrorTest';
  }
}
