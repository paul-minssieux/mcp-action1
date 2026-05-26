import { z } from "zod";
import { client } from "../client.js";
import type { Tool } from "./types.js";

export const organizationTools: Tool[] = [
  {
    name: "get_me",
    description: "Get information about the currently authenticated API user.",
    inputSchema: z.object({}),
    async handler() {
      return client.get("/Me");
    },
  },
  {
    name: "list_organizations",
    description: "List all organizations accessible to the authenticated API credentials.",
    inputSchema: z.object({}),
    async handler() {
      return client.get("/organizations");
    },
  },
];
