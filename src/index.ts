#!/usr/bin/env node
import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.js";
import { log } from "./logger.js";

async function startStdio() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server runs on stdio — no console output after this point
}

async function main() {
  const transport = (process.env.MCP_TRANSPORT ?? "stdio").toLowerCase();

  if (transport === "http" || transport === "streamable-http") {
    // Loaded lazily so the stdio path has no dependency on express / auth config.
    const { startHttpServer } = await import("./http.js");
    await startHttpServer();
    return;
  }

  if (transport !== "stdio") {
    log.warn(`Unknown MCP_TRANSPORT "${transport}". Falling back to stdio.`);
  }
  await startStdio();
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
