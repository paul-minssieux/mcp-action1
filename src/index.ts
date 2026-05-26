#!/usr/bin/env node
import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool as MCPTool,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { allTools } from "./tools/index.js";
import { log } from "./logger.js";

const server = new Server(
  { name: "mcp-action1", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools: MCPTool[] = allTools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(t.inputSchema, { $refStrategy: "none" }) as MCPTool["inputSchema"],
  }));
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const tool = allTools.find((t) => t.name === name);
  if (!tool) {
    return {
      content: [{ type: "text", text: `Unknown tool: "${name}"` }],
      isError: true,
    };
  }

  try {
    const parsed = tool.inputSchema.parse(args ?? {});
    const result = await tool.handler(parsed as Record<string, unknown>);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    log.error(`Error executing tool "${name}"`, err);

    // Return detailed validation errors directly to the LLM for self-correction
    if (err instanceof Error && err.name === "ZodError") {
      return {
        content: [{ type: "text", text: `Validation Error: ${err.message}` }],
        isError: true,
      };
    }

    // Return clean, user-safe error message to the LLM client
    const clientMessage = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${clientMessage}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server runs on stdio — no console output after this point
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
