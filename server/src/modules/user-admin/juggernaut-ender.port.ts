/** Turns off every juggernaut mode of an account (the campaigns module's `JuggernautService`):
 *  privileged access does not outlive the admin role that gave it. */
export interface JuggernautEnderPort {
  endAllOf(userId: string): Promise<void>;
}
