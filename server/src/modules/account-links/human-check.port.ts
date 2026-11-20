/** The anti-bot check of the public forms (sign-up, forgotten password): the token the widget put
 *  in the form, checked with the provider. Any doubt is a refusal (fails closed).
 *
 *  Example: `if (!(await humanCheck.verify(input.humanCheckToken, request.ip))) throw …` */
export interface HumanCheckPort {
  verify(token: string, remoteIp: string): Promise<boolean>;
}
