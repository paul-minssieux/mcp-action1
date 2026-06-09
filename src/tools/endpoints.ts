import { z } from "zod";
import { client } from "../client.js";
import { isHelpdesk } from "../profile.js";
import type { Tool } from "./types.js";

const OrgId = z
  .string()
  .uuid()
  .optional()
  .describe("Organization ID (must be a valid UUID). Defaults to ACTION1_ORG_ID env var if not provided.");

const IdSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/);

export const endpointTools: Tool[] = [
  {
    name: "list_endpoints",
    description:
      "List managed endpoints (agents) in an organization. Supports pagination and extended fields.",
    inputSchema: z.object({
      org_id: OrgId,
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .default(100)
        .describe("Number of results per page (max 1000)."),
      next_page: z.string().optional().describe("Pagination cursor from a previous response."),
      fields: z
        .string()
        .optional()
        .describe(
          'Comma-separated fields to include, or "*" for all extended fields (includes patch status).'
        ),
    }),
    async handler(input) {
      const { org_id, limit, next_page, fields } = input as {
        org_id?: string;
        limit?: number;
        next_page?: string;
        fields?: string;
      };
      const org = client.resolveOrg(org_id);
      const query: Record<string, string | number> = {};
      if (limit) query.limit = limit;
      if (next_page) query.next_page = next_page;
      if (fields) query.fields = fields;
      return client.get(`/endpoints/managed/${org}`, query);
    },
  },

  {
    name: "get_endpoint",
    description: "Get detailed information about a single managed endpoint by its ID.",
    inputSchema: z.object({
      org_id: OrgId,
      endpoint_id: IdSchema.describe("The endpoint (device) ID."),
    }),
    async handler(input) {
      const { org_id, endpoint_id } = input as { org_id?: string; endpoint_id: string };
      const org = client.resolveOrg(org_id);
      return client.get(`/endpoints/managed/${org}/${endpoint_id}`);
    },
  },

  {
    name: "update_endpoint",
    description: "Update properties of a managed endpoint such as its name or comment.",
    inputSchema: z.object({
      org_id: OrgId,
      endpoint_id: IdSchema.describe("The endpoint ID to update."),
      name: z.string().optional().describe("New display name for the endpoint."),
      comment: z.string().optional().describe("Free-text comment/note for the endpoint."),
      custom_attributes: z
        .record(z.string())
        .optional()
        .describe("Custom attributes as key-value pairs."),
    }),
    async handler(input) {
      const { org_id, endpoint_id, ...body } = input as {
        org_id?: string;
        endpoint_id: string;
        name?: string;
        comment?: string;
        custom_attributes?: Record<string, string>;
      };
      const org = client.resolveOrg(org_id);
      return client.patch(`/endpoints/managed/${org}/${endpoint_id}`, body);
    },
  },

  {
    name: "delete_endpoint",
    description:
      "Remove (unmanage) an endpoint from the organization. The agent will be uninstalled.",
    inputSchema: z.object({
      org_id: OrgId,
      endpoint_id: IdSchema.describe("The endpoint ID to remove."),
    }),
    async handler(input) {
      const { org_id, endpoint_id } = input as { org_id?: string; endpoint_id: string };
      const org = client.resolveOrg(org_id);
      return client.delete(`/endpoints/managed/${org}/${endpoint_id}`);
    },
  },

  {
    name: "list_discovery_endpoints",
    description:
      "List unmanaged/discovered endpoints (devices seen on the network but not yet running the Action1 agent).",
    inputSchema: z.object({
      org_id: OrgId,
    }),
    async handler(input) {
      const { org_id } = input as { org_id?: string };
      const org = client.resolveOrg(org_id);
      return client.get(`/endpoints/discovery/${org}`);
    },
  },

  {
    name: "requery_installed_apps",
    description:
      "Trigger a refresh of installed application data for all endpoints or a specific endpoint.",
    inputSchema: z.object({
      org_id: OrgId,
      endpoint_id: IdSchema
        .optional()
        .describe("Specific endpoint ID. Omit to refresh all endpoints in the org."),
    }),
    async handler(input) {
      const { org_id, endpoint_id } = input as { org_id?: string; endpoint_id?: string };
      const org = client.resolveOrg(org_id);
      if (endpoint_id) {
        return client.post(`/apps/${org}/requery/${endpoint_id}`);
      }
      if (isHelpdesk()) {
        throw new Error(
          "Helpdesk profile: org-wide requery is not allowed. Specify an endpoint_id."
        );
      }
      return client.post(`/apps/${org}/requery`);
    },
  },

  {
    name: "requery_installed_updates",
    description: "Trigger a refresh of installed Windows updates data for all endpoints in the org.",
    inputSchema: z.object({
      org_id: OrgId,
    }),
    async handler(input) {
      const { org_id } = input as { org_id?: string };
      const org = client.resolveOrg(org_id);
      return client.post(`/updates/installed/${org}/requery`);
    },
  },
];
