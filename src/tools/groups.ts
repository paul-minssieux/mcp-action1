import { z } from "zod";
import { client } from "../client.js";
import type { Tool } from "./types.js";

const OrgId = z.string().uuid().optional().describe("Organization ID (must be a valid UUID). Defaults to ACTION1_ORG_ID env var.");

const IdSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/);

export const groupTools: Tool[] = [
  {
    name: "list_endpoint_groups",
    description: "List all endpoint groups in an organization.",
    inputSchema: z.object({
      org_id: OrgId,
    }),
    async handler(input) {
      const { org_id } = input as { org_id?: string };
      const org = client.resolveOrg(org_id);
      return client.get(`/endpoints/groups/${org}`);
    },
  },

  {
    name: "get_endpoint_group_contents",
    description: "List the endpoints that are members of a specific endpoint group.",
    inputSchema: z.object({
      org_id: OrgId,
      group_id: IdSchema.describe("The endpoint group ID."),
    }),
    async handler(input) {
      const { org_id, group_id } = input as { org_id?: string; group_id: string };
      const org = client.resolveOrg(org_id);
      return client.get(`/endpoints/groups/${org}/${group_id}/contents`);
    },
  },

  {
    name: "add_endpoint_to_group",
    description: "Add one or more endpoints to an endpoint group.",
    inputSchema: z.object({
      org_id: OrgId,
      group_id: IdSchema.describe("The endpoint group ID."),
      endpoint_ids: z.array(IdSchema).describe("Array of endpoint IDs to add to the group."),
    }),
    async handler(input) {
      const { org_id, group_id, endpoint_ids } = input as {
        org_id?: string;
        group_id: string;
        endpoint_ids: string[];
      };
      const org = client.resolveOrg(org_id);
      return client.post(`/endpoints/groups/${org}/${group_id}/contents`, {
        members: endpoint_ids,
      });
    },
  },

  {
    name: "update_endpoint_group",
    description: "Update an endpoint group's name or description.",
    inputSchema: z.object({
      org_id: OrgId,
      group_id: IdSchema.describe("The endpoint group ID."),
      name: z.string().optional().describe("New name for the group."),
      description: z.string().optional().describe("New description for the group."),
    }),
    async handler(input) {
      const { org_id, group_id, ...body } = input as {
        org_id?: string;
        group_id: string;
        name?: string;
        description?: string;
      };
      const org = client.resolveOrg(org_id);
      return client.patch(`/endpoints/groups/${org}/${group_id}`, body);
    },
  },

  {
    name: "delete_endpoint_group",
    description: "Delete an endpoint group (endpoints in the group are not deleted).",
    inputSchema: z.object({
      org_id: OrgId,
      group_id: IdSchema.describe("The endpoint group ID to delete."),
    }),
    async handler(input) {
      const { org_id, group_id } = input as { org_id?: string; group_id: string };
      const org = client.resolveOrg(org_id);
      return client.delete(`/endpoints/groups/${org}/${group_id}`);
    },
  },
];
