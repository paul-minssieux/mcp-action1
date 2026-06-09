/**
 * Tool exposure profiles.
 *
 * - "full" (default): every registered tool is exposed.
 * - "helpdesk": a reduced catalog for L1/L2 operators working on one device at
 *   a time. Fleet-scoped mutations (groups, automations, agent removal) are
 *   hidden, and the remaining action tools (deploy_updates, deploy_software,
 *   run_script, requery_installed_apps) refuse to run against anything other
 *   than a single explicit endpoint.
 *
 * ACTION1_READONLY remains an independent switch and is applied on top of the
 * selected profile.
 */
export type Action1Profile = "full" | "helpdesk";

export function getProfile(): Action1Profile {
  const raw = (process.env.ACTION1_PROFILE ?? "full").trim().toLowerCase();
  if (raw === "" || raw === "full") return "full";
  if (raw === "helpdesk") return "helpdesk";
  // Fail closed: a typo in ACTION1_PROFILE must not silently expose the full catalog.
  throw new Error(
    `Unknown ACTION1_PROFILE value "${raw}". Expected "full" or "helpdesk".`
  );
}

export function isHelpdesk(): boolean {
  return getProfile() === "helpdesk";
}

/**
 * Guard for single-device targeting in the helpdesk profile. Call from action
 * tools before building a policy payload. No-op in the full profile.
 */
export function assertSingleEndpointTarget(
  group_ids?: string[],
  endpoint_ids?: string[]
): void {
  if (!isHelpdesk()) return;
  if ((group_ids ?? []).length > 0) {
    throw new Error(
      "Helpdesk profile: targeting endpoint groups is not allowed. " +
        "Specify exactly one endpoint_id instead."
    );
  }
  if ((endpoint_ids ?? []).length !== 1) {
    throw new Error(
      "Helpdesk profile: actions are limited to one device at a time. " +
        "Specify exactly one endpoint_id."
    );
  }
}
