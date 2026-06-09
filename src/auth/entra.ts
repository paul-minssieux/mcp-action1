import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { InvalidTokenError, InsufficientScopeError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { log } from "../logger.js";

export interface EntraConfig {
  tenantId: string;
  /** Application (client) ID of the Entra app registration that represents this API. */
  clientId: string;
  /** Object ID of the security group whose members are allowed to use the server. */
  requiredGroupId: string;
  /**
   * Accepted token audiences. Defaults to the client ID and `api://<clientId>`,
   * which covers both v2 and v1 access tokens issued for this API.
   */
  allowedAudiences: string[];
  /** Optional Application ID URI / app role required instead of (or in addition to) group membership. */
  requiredAppRole?: string;
}

interface EntraOpenIdConfig {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  response_types_supported?: string[];
  scopes_supported?: string[];
  grant_types_supported?: string[];
  code_challenge_methods_supported?: string[];
}

const AUTHORITY = "https://login.microsoftonline.com";

export function loadEntraConfig(): EntraConfig {
  const tenantId = required("ENTRA_TENANT_ID");
  const clientId = required("ENTRA_CLIENT_ID");
  const requiredGroupId = required("ENTRA_REQUIRED_GROUP_ID");

  const audiencesFromEnv = (process.env.ENTRA_AUDIENCE ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  const allowedAudiences =
    audiencesFromEnv.length > 0 ? audiencesFromEnv : [clientId, `api://${clientId}`];

  return {
    tenantId,
    clientId,
    requiredGroupId,
    allowedAudiences,
    requiredAppRole: process.env.ENTRA_REQUIRED_APP_ROLE?.trim() || undefined,
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. It must be set when running the HTTP transport with Entra ID authentication.`
    );
  }
  return value;
}

/** Fetches the tenant's OpenID Connect discovery document (used for client-facing metadata). */
export async function fetchEntraOpenIdConfig(tenantId: string): Promise<EntraOpenIdConfig> {
  const url = `${AUTHORITY}/${tenantId}/v2.0/.well-known/openid-configuration`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch Entra ID discovery document (${res.status}) from ${url}`);
  }
  return (await res.json()) as EntraOpenIdConfig;
}

/**
 * Verifies Microsoft Entra ID (Azure AD) access tokens and enforces that the
 * caller is a member of a specific security group (or holds a specific app role).
 *
 * Validation performed on every request:
 *  - JWT signature against the tenant JWKS (RS256)
 *  - issuer matches the tenant (v1 `sts.windows.net` and v2 `login.microsoftonline.com` forms)
 *  - audience matches this API's app registration
 *  - expiry / not-before
 *  - the `groups` claim contains the required group object ID
 */
export class EntraTokenVerifier implements OAuthTokenVerifier {
  private readonly jwks: JWTVerifyGetKey;
  private readonly acceptedIssuers: string[];

  constructor(private readonly config: EntraConfig, jwksUri: string) {
    this.jwks = createRemoteJWKSet(new URL(jwksUri));
    this.acceptedIssuers = [
      `${AUTHORITY}/${config.tenantId}/v2.0`,
      `https://sts.windows.net/${config.tenantId}/`,
    ];
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    let payload: JWTPayload;
    try {
      const result = await jwtVerify(token, this.jwks, {
        algorithms: ["RS256"],
        issuer: this.acceptedIssuers,
        audience: this.config.allowedAudiences,
      });
      payload = result.payload;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`Rejected access token: ${message}`);
      throw new InvalidTokenError("Invalid or expired access token");
    }

    this.enforceAuthorization(payload);

    const scopes =
      typeof payload.scp === "string"
        ? payload.scp.split(" ").filter(Boolean)
        : Array.isArray(payload.roles)
          ? (payload.roles as string[])
          : [];

    return {
      token,
      clientId: (payload.azp as string) ?? (payload.appid as string) ?? this.config.clientId,
      scopes,
      expiresAt: typeof payload.exp === "number" ? payload.exp : undefined,
      extra: {
        sub: payload.sub,
        oid: payload.oid,
        upn: payload.upn ?? payload.preferred_username,
        tid: payload.tid,
      },
    };
  }

  /** Enforces group membership and/or app role. Throws InsufficientScopeError (HTTP 403) on failure. */
  private enforceAuthorization(payload: JWTPayload): void {
    // Detect the Entra "groups overage" condition: when a user is in too many
    // groups, the groups claim is omitted and a _claim_names pointer is added
    // instead. We fail closed with an actionable message rather than silently
    // letting the request through.
    const claimNames = payload["_claim_names"] as Record<string, string> | undefined;
    if (claimNames?.groups) {
      log.warn("Access token has a groups overage claim; group membership cannot be verified from the token.");
      throw new InsufficientScopeError(
        "Group membership could not be verified (groups overage). Configure the Entra app registration to emit group claims via an app role, or assign the API an app role for this group."
      );
    }

    const roles = Array.isArray(payload.roles) ? (payload.roles as string[]) : [];
    if (this.config.requiredAppRole && roles.includes(this.config.requiredAppRole)) {
      return;
    }

    const groups = Array.isArray(payload.groups) ? (payload.groups as string[]) : [];
    if (groups.includes(this.config.requiredGroupId)) {
      return;
    }

    log.warn(
      `Access denied for sub=${String(payload.sub)} oid=${String(payload.oid)}: not a member of required group.`
    );
    throw new InsufficientScopeError(
      "Access denied: the authenticated user is not a member of the group authorized to use this server."
    );
  }
}
