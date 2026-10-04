/**
 * Brings the configured gateway's adapter into the registry.
 *
 * Adapters register themselves when imported, but nothing else imports them, so this is the one place
 * that pulls them in. Called from the payments service, which every money path goes through.
 *
 * Each adapter decides for itself whether it is configured enough to register: a half-configured gateway
 * would be reported as connected on the finance screen and then fail on the first player to tap Pay.
 * Missing credentials mean the club stays on pay-at-club, which works.
 */
import { registerPaymob } from "./paymob";

let done = false;

export function registerConfiguredProviders(): void {
  if (done) return;
  done = true;
  registerPaymob();
}

/** Tests register their own adapters and need the real ones out of the way. */
export function resetProviderRegistration(): void {
  done = false;
}
