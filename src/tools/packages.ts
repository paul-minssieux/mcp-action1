import { z } from "zod";
import { client } from "../client.js";
import type { Tool } from "./types.js";

const IdSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/);

export const packageTools: Tool[] = [
  {
    name: "list_packages",
    description:
      "List all software packages available in the Action1 managed software catalog.",
    inputSchema: z.object({}),
    async handler() {
      return client.get("/packages/all");
    },
  },

  {
    name: "list_software_repository",
    description:
      "List software in the Action1 software repository, optionally including available versions for a specific package.",
    inputSchema: z.object({
      package_id: IdSchema
        .optional()
        .describe(
          "Specific package ID to retrieve versions for. Omit to list all packages in the repository."
        ),
    }),
    async handler(input) {
      const { package_id } = input as { package_id?: string };
      if (package_id) {
        return client.get(`/software-repository/all/${package_id}`, { fields: "versions" });
      }
      return client.get("/software-repository/all");
    },
  },

  {
    name: "list_installed_apps",
    description:
      "List installed applications across endpoints in an organization.",
    inputSchema: z.object({
      org_id: z
        .string()
        .uuid()
        .optional()
        .describe("Organization ID (must be a valid UUID). Defaults to ACTION1_ORG_ID env var."),
      endpoint_id: IdSchema
        .optional()
        .describe("Filter to a specific endpoint. Omit for org-wide results."),
    }),
    async handler(input) {
      const { org_id, endpoint_id } = input as { org_id?: string; endpoint_id?: string };
      const org = client.resolveOrg(org_id);
      if (endpoint_id) {
        return client.get(`/apps/${org}/data/${endpoint_id}`);
      }
      return client.get(`/apps/${org}/data`);
    },
  },
];
