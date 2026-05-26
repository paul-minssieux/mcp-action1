import { z } from "zod";
import { client } from "../client.js";
import type { Tool } from "./types.js";

const OrgId = z.string().uuid().optional().describe("Organization ID (must be a valid UUID). Defaults to ACTION1_ORG_ID env var.");

const IdSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/);

// Build the endpoints array from group_ids and endpoint_ids
function buildEndpoints(
  group_ids?: string[],
  endpoint_ids?: string[]
): Array<{ id: string; type: string }> {
  const targets: Array<{ id: string; type: string }> = [];
  for (const id of group_ids ?? []) targets.push({ id, type: "EndpointGroup" });
  for (const id of endpoint_ids ?? []) targets.push({ id, type: "Endpoint" });
  // Fall back to all endpoints if nothing specified
  if (targets.length === 0) targets.push({ id: "ALL", type: "EndpointGroup" });
  return targets;
}

// Build packages array: [{ "<package_id>": "<version>" }, ...]
// When no specific packages are given, use the default wildcard
function buildPackages(
  packages?: Array<{ package_id: string; version?: string }>
): Array<Record<string, string>> {
  if (!packages || packages.length === 0) return [{ default: "default" }];
  return packages.map((p) => ({ [p.package_id]: p.version ?? "latest" }));
}

export const policyTools: Tool[] = [
  {
    name: "list_policies",
    description:
      "List policy instances (one-time deployments: patches, software, scripts) in an organization.",
    inputSchema: z.object({
      org_id: OrgId,
    }),
    async handler(input) {
      const { org_id } = input as { org_id?: string };
      const org = client.resolveOrg(org_id);
      return client.get(`/policies/instances/${org}`);
    },
  },

  {
    name: "get_policy",
    description: "Get details of a specific policy instance including its configuration.",
    inputSchema: z.object({
      org_id: OrgId,
      policy_id: IdSchema.describe("The policy instance ID."),
    }),
    async handler(input) {
      const { org_id, policy_id } = input as { org_id?: string; policy_id: string };
      const org = client.resolveOrg(org_id);
      return client.get(`/policies/instances/${org}/${policy_id}`);
    },
  },

  {
    name: "get_policy_results",
    description:
      "Get per-endpoint execution results for a policy instance (success/failure status per device).",
    inputSchema: z.object({
      org_id: OrgId,
      policy_id: IdSchema.describe("The policy instance ID."),
    }),
    async handler(input) {
      const { org_id, policy_id } = input as { org_id?: string; policy_id: string };
      const org = client.resolveOrg(org_id);
      return client.get(`/policies/instances/${org}/${policy_id}/endpoint_results`);
    },
  },

  {
    name: "deploy_updates",
    description:
      "Deploy Windows updates or patches to endpoints or groups. " +
      "Specify packages as [{package_id, version}] from list_windows_updates or list_vulnerabilities results. " +
      "Omit packages to deploy all approved updates. " +
      "Omit group_ids and endpoint_ids to target all endpoints.",
    inputSchema: z.object({
      org_id: OrgId,
      name: z.string().describe("Display name for this deployment job."),
      packages: z
        .array(
          z.object({
            package_id: IdSchema.describe("Package ID from list_windows_updates results."),
            version: z.string().optional().describe("Specific version. Omit for latest."),
          })
        )
        .optional()
        .describe("Specific patches to install. Omit to install all approved updates."),
      group_ids: z
        .array(IdSchema)
        .optional()
        .describe("Target endpoint group IDs. Omit to target all endpoints."),
      endpoint_ids: z
        .array(IdSchema)
        .optional()
        .describe("Target specific endpoint IDs."),
      auto_reboot: z
        .enum(["yes", "no"])
        .optional()
        .default("yes")
        .describe('Reboot automatically after patching ("yes" or "no").'),
      update_approval: z
        .enum(["manual", "automatic"])
        .optional()
        .default("manual")
        .describe("Whether updates require manual or automatic approval."),
      retry_minutes: z
        .number()
        .int()
        .optional()
        .default(1440)
        .describe("Minutes to keep retrying on offline endpoints (default 1440 = 24h)."),
    }),
    async handler(input) {
      const { org_id, name, packages, group_ids, endpoint_ids, auto_reboot, update_approval, retry_minutes } =
        input as {
          org_id?: string;
          name: string;
          packages?: Array<{ package_id: string; version?: string }>;
          group_ids?: string[];
          endpoint_ids?: string[];
          auto_reboot?: "yes" | "no";
          update_approval?: "manual" | "automatic";
          retry_minutes?: number;
        };
      const org = client.resolveOrg(org_id);
      return client.post(`/policies/instances/${org}`, {
        name,
        retry_minutes: retry_minutes ?? 1440,
        endpoints: buildEndpoints(group_ids, endpoint_ids),
        actions: [
          {
            name: "Deploy Update",
            template_id: "deploy_update",
            params: {
              display_summary: "",
              packages: buildPackages(packages),
              update_approval: update_approval ?? "manual",
              scope: "Specified",
              reboot_options: {
                auto_reboot: auto_reboot ?? "yes",
                show_message: "yes",
                message_text:
                  "Your computer requires maintenance and will be rebooted. Please save all work and reboot now to avoid losing any data.",
                timeout: 240,
              },
            },
          },
        ],
      });
    },
  },

  {
    name: "deploy_software",
    description:
      "Deploy a software package from the Action1 software repository to endpoints or groups. " +
      "Use list_packages or list_software_repository to find package_id and version values.",
    inputSchema: z.object({
      org_id: OrgId,
      name: z.string().describe("Display name for this deployment job."),
      packages: z
        .array(
          z.object({
            package_id: IdSchema.describe("Package ID from list_packages results."),
            version: z.string().optional().describe("Specific version. Omit for latest."),
          })
        )
        .describe("One or more software packages to install."),
      group_ids: z
        .array(IdSchema)
        .optional()
        .describe("Target endpoint group IDs. Omit to target all endpoints."),
      endpoint_ids: z
        .array(IdSchema)
        .optional()
        .describe("Target specific endpoint IDs."),
      auto_reboot: z
        .enum(["yes", "no"])
        .optional()
        .default("no")
        .describe('Reboot after install ("yes" or "no"). Default is "no" for software.'),
      retry_minutes: z
        .number()
        .int()
        .optional()
        .default(1440)
        .describe("Minutes to keep retrying on offline endpoints (default 1440 = 24h)."),
    }),
    async handler(input) {
      const { org_id, name, packages, group_ids, endpoint_ids, auto_reboot, retry_minutes } =
        input as {
          org_id?: string;
          name: string;
          packages: Array<{ package_id: string; version?: string }>;
          group_ids?: string[];
          endpoint_ids?: string[];
          auto_reboot?: "yes" | "no";
          retry_minutes?: number;
        };
      const org = client.resolveOrg(org_id);
      return client.post(`/policies/instances/${org}`, {
        name,
        retry_minutes: retry_minutes ?? 1440,
        endpoints: buildEndpoints(group_ids, endpoint_ids),
        actions: [
          {
            name: "Deploy Software",
            template_id: "deploy_package",
            params: {
              display_summary: "",
              packages: buildPackages(packages),
              reboot_options: {
                auto_reboot: auto_reboot ?? "no",
              },
            },
          },
        ],
      });
    },
  },

  {
    name: "run_script",
    description:
      "Run a script from the Action1 script library on one or more endpoints or groups. " +
      "Use list_scripts first to find the script_id. " +
      "Pass script parameters using the params array (name/value pairs matching the script's declared params).",
    inputSchema: z.object({
      org_id: OrgId,
      name: z.string().describe("Display name for this run job (shows in the Action1 console)."),
      script_id: IdSchema
        .describe("Script ID from list_scripts (e.g. 'my_script_1680786839979')."),
      script_params: z
        .array(
          z.object({
            name: z.string().describe("Parameter name as declared in the script."),
            value: z.string().describe("Value to pass for this parameter."),
            type: z.string().optional().default("String").describe("Parameter type (default: String)."),
          })
        )
        .optional()
        .describe("Values for any parameters the script declares. Omit if the script has no params."),
      group_ids: z
        .array(IdSchema)
        .optional()
        .describe("Target endpoint group IDs. Omit to target all endpoints."),
      endpoint_ids: z
        .array(IdSchema)
        .optional()
        .describe("Target specific endpoint IDs."),
      reboot_exit_codes: z
        .string()
        .optional()
        .describe("Comma-separated exit codes that should trigger a reboot (e.g. '3010,1641')."),
      retry_minutes: z
        .number()
        .int()
        .optional()
        .default(1440)
        .describe("Minutes to keep retrying on offline endpoints (default 1440 = 24h)."),
    }),
    async handler(input) {
      const {
        org_id,
        name,
        script_id,
        script_params,
        group_ids,
        endpoint_ids,
        reboot_exit_codes,
        retry_minutes,
      } = input as {
        org_id?: string;
        name: string;
        script_id: string;
        script_params?: Array<{ name: string; value: string; type?: string }>;
        group_ids?: string[];
        endpoint_ids?: string[];
        reboot_exit_codes?: string;
        retry_minutes?: number;
      };
      const org = client.resolveOrg(org_id);
      return client.post(`/policies/instances/${org}`, {
        name,
        retry_minutes: retry_minutes ?? 1440,
        endpoints: buildEndpoints(group_ids, endpoint_ids),
        actions: [
          {
            name,
            template_id: "run_script",
            params: {
              display_summary: name,
              run_script_id: script_id,
              run_script_params: (script_params ?? []).map((p) => ({
                name: p.name,
                type: p.type ?? "String",
                value: p.value,
              })),
              condition_script_text: "",
              condition_script_language: "PowerShell",
              reboot_exit_codes: reboot_exit_codes ?? "",
            },
          },
        ],
      });
    },
  },

  {
    name: "list_automations",
    description:
      "List automation schedules (recurring policies) configured in the organization.",
    inputSchema: z.object({
      org_id: OrgId,
    }),
    async handler(input) {
      const { org_id } = input as { org_id?: string };
      const org = client.resolveOrg(org_id);
      return client.get(`/policies/schedules/${org}`);
    },
  },

  {
    name: "create_automation",
    description:
      "Create an automation schedule to run a policy (patch or software) on a recurring basis.",
    inputSchema: z.object({
      org_id: OrgId,
      name: z.string().describe("Name for this automation."),
      schedule: z
        .object({
          frequency: z
            .enum(["daily", "weekly", "monthly"])
            .describe("How often the automation runs."),
          day_of_week: z
            .number()
            .int()
            .min(0)
            .max(6)
            .optional()
            .describe("Day of week for weekly schedules (0=Sunday)."),
          day_of_month: z
            .number()
            .int()
            .min(1)
            .max(31)
            .optional()
            .describe("Day of month for monthly schedules."),
          time: z.string().describe('Time to run in HH:MM format (24h UTC), e.g. "02:00".'),
        })
        .describe("Schedule configuration."),
      policy: z.record(z.unknown()).describe("Full policy body (same structure as deploy_updates or deploy_software)."),
    }),
    async handler(input) {
      const { org_id, ...body } = input as {
        org_id?: string;
        [key: string]: unknown;
      };
      const org = client.resolveOrg(org_id);
      return client.post(`/policies/schedules/${org}`, body);
    },
  },

  {
    name: "update_automation",
    description: "Update an existing automation schedule.",
    inputSchema: z.object({
      org_id: OrgId,
      automation_id: IdSchema.describe("The automation schedule ID to update."),
      name: z.string().optional().describe("New name for the automation."),
      enabled: z.boolean().optional().describe("Enable or disable the automation."),
      schedule: z.record(z.unknown()).optional().describe("Updated schedule configuration."),
    }),
    async handler(input) {
      const { org_id, automation_id, ...body } = input as {
        org_id?: string;
        automation_id: string;
        [key: string]: unknown;
      };
      const org = client.resolveOrg(org_id);
      return client.patch(`/policies/schedules/${org}/${automation_id}`, body);
    },
  },

  {
    name: "delete_automation",
    description: "Delete an automation schedule.",
    inputSchema: z.object({
      org_id: OrgId,
      automation_id: IdSchema.describe("The automation schedule ID to delete."),
    }),
    async handler(input) {
      const { org_id, automation_id } = input as { org_id?: string; automation_id: string };
      const org = client.resolveOrg(org_id);
      return client.delete(`/policies/schedules/${org}/${automation_id}`);
    },
  },
];
