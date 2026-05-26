import { z } from "zod";
import { client } from "../client.js";
import type { Tool } from "./types.js";

const OrgId = z.string().uuid().optional().describe("Organization ID (must be a valid UUID). Defaults to ACTION1_ORG_ID env var.");

export const vulnerabilityTools: Tool[] = [
  {
    name: "list_vulnerabilities",
    description:
      "List known vulnerabilities (CVEs) detected across endpoints in the organization. Useful for prioritizing patching.",
    inputSchema: z.object({
      org_id: OrgId,
      severity: z
        .enum(["critical", "high", "medium", "low"])
        .optional()
        .describe("Filter by CVE severity."),
    }),
    async handler(input) {
      const { org_id, severity } = input as { org_id?: string; severity?: string };
      const org = client.resolveOrg(org_id);
      const query: Record<string, string> = {};
      if (severity) query.severity = severity;
      return client.get(`/Vulnerabilities/${org}`, query);
    },
  },

  {
    name: "list_windows_updates",
    description:
      "List available Windows updates detected across endpoints in the organization, including patch status.",
    inputSchema: z.object({
      org_id: OrgId,
    }),
    async handler(input) {
      const { org_id } = input as { org_id?: string };
      const org = client.resolveOrg(org_id);
      return client.get(`/updates/${org}`);
    },
  },
];
