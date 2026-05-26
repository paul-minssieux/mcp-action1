import { z } from "zod";
import { client } from "../client.js";
import type { Tool } from "./types.js";

const OrgId = z.string().uuid().optional().describe("Organization ID (must be a valid UUID). Defaults to ACTION1_ORG_ID env var.");

const IdSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/);

export const reportTools: Tool[] = [
  {
    name: "list_reports",
    description: "List all available reports in Action1.",
    inputSchema: z.object({}),
    async handler() {
      return client.get("/reports/all");
    },
  },

  {
    name: "get_report_data",
    description: "Retrieve the data rows for a specific report.",
    inputSchema: z.object({
      org_id: OrgId,
      report_id: IdSchema.describe("The report ID."),
    }),
    async handler(input) {
      const { org_id, report_id } = input as { org_id?: string; report_id: string };
      const org = client.resolveOrg(org_id);
      return client.get(`/reportdata/${org}/${report_id}/data`);
    },
  },

  {
    name: "export_report",
    description: "Export a report as CSV data.",
    inputSchema: z.object({
      org_id: OrgId,
      report_id: IdSchema.describe("The report ID to export."),
    }),
    async handler(input) {
      const { org_id, report_id } = input as { org_id?: string; report_id: string };
      const org = client.resolveOrg(org_id);
      return client.get(`/reportdata/${org}/${report_id}/export`);
    },
  },

  {
    name: "requery_report",
    description: "Trigger a data refresh for a specific report.",
    inputSchema: z.object({
      org_id: OrgId,
      report_id: IdSchema.describe("The report ID to refresh."),
    }),
    async handler(input) {
      const { org_id, report_id } = input as { org_id?: string; report_id: string };
      const org = client.resolveOrg(org_id);
      return client.post(`/reportdata/${org}/${report_id}/requery`);
    },
  },

  {
    name: "get_activity_logs",
    description:
      "Retrieve the activity/audit logs for an organization (who did what, when).",
    inputSchema: z.object({
      org_id: OrgId,
    }),
    async handler(input) {
      const { org_id } = input as { org_id?: string };
      const org = client.resolveOrg(org_id);
      return client.get(`/logs/${org}`);
    },
  },

  {
    name: "list_setting_templates",
    description:
      "List setting templates configured in the organization (used for agent and policy configuration).",
    inputSchema: z.object({
      org_id: OrgId,
    }),
    async handler(input) {
      const { org_id } = input as { org_id?: string };
      const org = client.resolveOrg(org_id);
      return client.get(`/setting_templates/${org}`);
    },
  },
];
