// No imports: next.config.ts loads this file directly.

/** MCCIA App Hub integration: the Payment Desk shown inside the App Hub
 * (iframe). The App Hub and the Payment Desk keep separate passwords; the
 * email is the same. A person signs in to the Payment Desk once inside the
 * App Hub and is then remembered there, so later App Hub visits open the
 * Payment Desk straight away.
 *
 * APP_HUB_ORIGINS: the App Hub's web address(es), comma separated, e.g.
 * "https://apphub.mcciapune.com". Unset means no change at all: no framing
 * header is sent and no login is treated as embedded. */
export function appHubOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.APP_HUB_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter((origin) => /^https?:\/\/[^/\s]+$/.test(origin));
}

/** The frame-ancestors header value, or null (send nothing) when no App Hub
 * is configured. */
export function frameAncestorsPolicy(env: NodeJS.ProcessEnv = process.env): string | null {
  const origins = appHubOrigins(env);
  return origins.length ? `frame-ancestors 'self' ${origins.join(" ")}` : null;
}
