import { z } from "zod";
import { client } from "../client.js";
import type { Tool } from "./types.js";

export const scriptTools: Tool[] = [
  {
    name: "list_scripts",
    description:
      "List all scripts available in the Action1 script library (both built-in and custom scripts).",
    inputSchema: z.object({}),
    async handler() {
      return client.get("/scripts/all");
    },
  },
];
