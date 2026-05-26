import { z } from "zod";

export interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  handler: (input: Record<string, unknown>) => Promise<unknown>;
}
