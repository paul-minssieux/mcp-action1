import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool as MCPTool,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { allTools, type Tool } from "./tools/index.js";
import { getProfile } from "./profile.js";
import { log } from "./logger.js";

/**
 * Tools that mutate state on managed endpoints (deploy software/patches, run
 * scripts, delete devices/groups/automations). When ACTION1_READONLY=true these
 * are not registered, so the server can be exposed for read-only inspection
 * without any risk of triggering fleet-wide changes.
 */
const MUTATING_TOOLS = new Set<string>([
  "update_endpoint",
  "delete_endpoint",
  "requery_installed_apps",
  "requery_installed_updates",
  "add_endpoint_to_group",
  "update_endpoint_group",
  "delete_endpoint_group",
  "deploy_updates",
  "deploy_software",
  "run_script",
  "create_automation",
  "update_automation",
  "delete_automation",
  "requery_report",
]);

/**
 * Tools exposed under ACTION1_PROFILE=helpdesk: diagnose a single device and
 * remediate it (patch, install software, run a script, refresh inventory).
 * Fleet-scoped mutations are deliberately absent: agent removal, group and
 * automation management, discovery, reports/exports and setting templates.
 * The action tools listed here additionally enforce single-endpoint targeting
 * (see profile.ts).
 */
const HELPDESK_TOOLS = new Set<string>([
  // Context
  "get_me",
  "list_organizations",
  // Device diagnostics
  "list_endpoints",
  "get_endpoint",
  "list_endpoint_groups",
  "get_endpoint_group_contents",
  "list_installed_apps",
  "list_windows_updates",
  "list_vulnerabilities",
  "get_activity_logs",
  // Catalogs needed to pick what to deploy/run
  "list_scripts",
  "list_packages",
  "list_software_repository",
  // Deployment follow-up
  "list_policies",
  "get_policy",
  "get_policy_results",
  // Single-device actions
  "update_endpoint",
  "requery_installed_apps",
  "deploy_updates",
  "deploy_software",
  "run_script",
]);

function isReadOnly(): boolean {
  return /^(1|true|yes)$/i.test(process.env.ACTION1_READONLY ?? "");
}

/** Returns the set of tools that should be exposed given the current configuration. */
export function getEnabledTools(): Tool[] {
  let tools = allTools;
  if (getProfile() === "helpdesk") {
    tools = tools.filter((t) => HELPDESK_TOOLS.has(t.name));
  }
  if (isReadOnly()) {
    tools = tools.filter((t) => !MUTATING_TOOLS.has(t.name));
  }
  return tools;
}

/**
 * Builds a fully configured MCP Server instance with all request handlers wired
 * up. A fresh instance is created per transport/connection so the same logic can
 * back both the stdio and the stateless Streamable HTTP transports.
 */
export function createMcpServer(): Server {
  const server = new Server(
    { name: "mcp-action1", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  const tools = getEnabledTools();
  if (getProfile() === "helpdesk") {
    log.info(
      "ACTION1_PROFILE=helpdesk — reduced tool catalog, actions limited to one endpoint at a time."
    );
  }
  if (isReadOnly()) {
    log.info("ACTION1_READONLY enabled — mutating tools are disabled.");
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const list: MCPTool[] = tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema, { $refStrategy: "none" }) as MCPTool["inputSchema"],
    }));
    return { tools: list };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const tool = tools.find((t) => t.name === name);
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

  return server;
}
