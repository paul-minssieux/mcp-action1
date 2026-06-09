import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  mcpAuthMetadataRouter,
  getOAuthProtectedResourceMetadataUrl,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import type { OAuthMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import { createMcpServer } from "./server.js";
import {
  EntraTokenVerifier,
  fetchEntraOpenIdConfig,
  loadEntraConfig,
} from "./auth/entra.js";
import { log } from "./logger.js";

const MCP_PATH = "/mcp";

function jsonRpcError(res: Response, status: number, message: string, id: unknown = null): void {
  res.status(status).json({
    jsonrpc: "2.0",
    error: { code: -32000, message },
    id,
  });
}

export async function startHttpServer(): Promise<void> {
  const port = Number(process.env.PORT ?? 3000);
  const publicUrl = (process.env.MCP_PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, "");

  const entraConfig = loadEntraConfig();
  const oidc = await fetchEntraOpenIdConfig(entraConfig.tenantId);
  const verifier = new EntraTokenVerifier(entraConfig, oidc.jwks_uri);

  const resourceUrl = new URL(MCP_PATH, publicUrl);
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(resourceUrl);

  // Advertise Entra ID as the authorization server backing this resource server,
  // so MCP clients (e.g. Claude) can discover where to obtain a token.
  const oauthMetadata: OAuthMetadata = {
    issuer: oidc.issuer,
    authorization_endpoint: oidc.authorization_endpoint,
    token_endpoint: oidc.token_endpoint,
    response_types_supported: oidc.response_types_supported ?? ["code"],
    grant_types_supported: oidc.grant_types_supported ?? ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: oidc.code_challenge_methods_supported ?? ["S256"],
    scopes_supported: oidc.scopes_supported,
  };

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "4mb" }));

  // Liveness/readiness probe for the container orchestrator (no auth).
  app.get("/healthz", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  // OAuth 2.0 Protected Resource Metadata + Authorization Server metadata.
  app.use(
    mcpAuthMetadataRouter({
      oauthMetadata,
      resourceServerUrl: resourceUrl,
      resourceName: "Action1 RMM MCP Server",
      scopesSupported: oidc.scopes_supported,
    })
  );

  const authMiddleware = requireBearerAuth({ verifier, resourceMetadataUrl });

  // Streamable HTTP transport in stateless mode: a fresh server + transport per
  // request. This keeps the container horizontally scalable (no session affinity).
  app.post(MCP_PATH, authMiddleware, async (req: Request, res: Response) => {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = createMcpServer();
    res.on("close", () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      log.error("Error handling MCP request", err);
      if (!res.headersSent) {
        jsonRpcError(res, 500, "Internal server error", (req.body as { id?: unknown })?.id ?? null);
      }
    }
  });

  // Stateless mode does not support server-initiated streams or session teardown.
  const methodNotAllowed = (_req: Request, res: Response) =>
    jsonRpcError(res, 405, "Method not allowed.");
  app.get(MCP_PATH, authMiddleware, methodNotAllowed);
  app.delete(MCP_PATH, authMiddleware, methodNotAllowed);

  await new Promise<void>((resolve) => {
    const httpServer = app.listen(port, () => {
      log.info(`Action1 MCP server (Streamable HTTP) listening on ${publicUrl}${MCP_PATH}`);
      log.info(`Protected resource metadata: ${resourceMetadataUrl}`);
      log.info(`Authorization server (Entra ID tenant): ${entraConfig.tenantId}`);
      resolve();
    });
    httpServer.on("error", (err) => {
      log.error("HTTP server error", err);
      process.exit(1);
    });
  });
}
