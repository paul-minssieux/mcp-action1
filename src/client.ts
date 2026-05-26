import { log } from "./logger.js";

const REGION_BASES: Record<string, string> = {
  na: "https://app.action1.com/api/3.0",
  eu: "https://app.eu.action1.com/api/3.0",
  au: "https://app.au.action1.com/api/3.0",
};

const TOKEN_ENDPOINTS: Record<string, string> = {
  na: "https://app.action1.com/api/3.0/oauth2/token",
  eu: "https://app.eu.action1.com/api/3.0/oauth2/token",
  au: "https://app.au.action1.com/api/3.0/oauth2/token",
};

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

interface CachedToken {
  access_token: string;
  expires_at: number;
}

export class Action1Client {
  private baseUrl: string;
  private tokenEndpoint: string;
  private clientId: string;
  private clientSecret: string;
  private cached: CachedToken | null = null;

  constructor() {
    const region = (process.env.ACTION1_REGION ?? "na").toLowerCase();
    const base = REGION_BASES[region];
    if (!base) throw new Error(`Unknown ACTION1_REGION "${region}". Use na, eu, or au.`);

    this.baseUrl = base;
    this.tokenEndpoint = TOKEN_ENDPOINTS[region];
    this.clientId = process.env.ACTION1_CLIENT_ID ?? "";
    this.clientSecret = process.env.ACTION1_CLIENT_SECRET ?? "";

    if (!this.clientId || !this.clientSecret) {
      throw new Error("ACTION1_CLIENT_ID and ACTION1_CLIENT_SECRET must be set.");
    }
  }

  private async getToken(): Promise<string> {
    const now = Date.now();
    if (this.cached && this.cached.expires_at > now + 30_000) {
      log.debug("Using cached authentication token.");
      return this.cached.access_token;
    }

    log.info("Requesting fresh authentication token from Action1...");
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const res = await fetch(this.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      log.error(`Action1 authentication failed with status ${res.status}: ${text}`);
      throw new Error(`Action1 auth failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as TokenResponse;
    this.cached = {
      access_token: data.access_token,
      expires_at: now + data.expires_in * 1000,
    };

    log.info("Successfully authenticated with Action1.");
    return this.cached.access_token;
  }

  private async executeFetch(
    url: string,
    init: RequestInit,
    method: string,
    path: string,
    retries = 3,
    delay = 1000
  ): Promise<Response> {
    try {
      const res = await fetch(url, init);

      if ((res.status === 429 || res.status >= 500) && retries > 0) {
        let retryAfterDelay = delay;
        const retryAfterHeader = res.headers.get("retry-after");

        if (retryAfterHeader) {
          const parsedSeconds = parseInt(retryAfterHeader, 10);
          if (!isNaN(parsedSeconds) && parsedSeconds > 0) {
            retryAfterDelay = parsedSeconds * 1000;
            log.warn(`Rate limit hit (HTTP 429). Server requested Retry-After: ${parsedSeconds}s. Respecting header...`);
          }
        } else {
          log.warn(`Transient response (${res.status}) from Action1. Retrying in ${delay}ms...`);
        }

        const backoff = retryAfterDelay * 2 + Math.random() * 200;
        await new Promise((resolve) => setTimeout(resolve, backoff));
        return this.executeFetch(url, init, method, path, retries - 1, backoff);
      }

      return res;
    } catch (err) {
      if (retries > 0) {
        log.warn(`Network error encountered: ${err instanceof Error ? err.message : String(err)}. Retrying in ${delay}ms...`);
        const backoff = delay * 2 + Math.random() * 200;
        await new Promise((resolve) => setTimeout(resolve, backoff));
        return this.executeFetch(url, init, method, path, retries - 1, backoff);
      }
      throw err;
    }
  }

  async request<T>(
    method: string,
    path: string,
    options: { query?: Record<string, string | number>; body?: unknown } = {}
  ): Promise<T> {
    log.info(`Executing Action1 API Request: ${method} ${path}`);
    const token = await this.getToken();

    let url = `${this.baseUrl}${path}`;
    if (options.query && Object.keys(options.query).length > 0) {
      const params = new URLSearchParams(
        Object.entries(options.query).map(([k, v]) => [k, String(v)])
      );
      url += `?${params.toString()}`;
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };

    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const res = await this.executeFetch(
      url,
      {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      },
      method,
      path
    );

    if (!res.ok) {
      const text = await res.text();
      log.error(`Action1 API error ${res.status} on ${method} ${path}: ${text}`);
      throw new Error(`Action1 API error ${res.status} on ${method} ${path}: ${text}`);
    }

    if (res.status === 204 || res.headers.get("content-length") === "0") {
      return {} as T;
    }

    return res.json() as Promise<T>;
  }

  get<T>(path: string, query?: Record<string, string | number>) {
    return this.request<T>("GET", path, { query });
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>("POST", path, { body });
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>("PATCH", path, { body });
  }

  delete<T>(path: string) {
    return this.request<T>("DELETE", path);
  }

  /** Resolve org_id: uses passed value or falls back to ACTION1_ORG_ID env var */
  resolveOrg(org_id?: string): string {
    const resolved = org_id ?? process.env.ACTION1_ORG_ID ?? "";
    if (!resolved) {
      throw new Error(
        "org_id is required. Pass it as a parameter or set ACTION1_ORG_ID in your environment."
      );
    }

    // Strict UUID validation (8-4-4-4-12 hex characters) to prevent path traversal/URL injection
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(resolved)) {
      throw new Error("Invalid organization ID format. Expected a standard UUID.");
    }

    return resolved;
  }
}

let _client: Action1Client | null = null;

function getInstance(): Action1Client {
  if (!_client) _client = new Action1Client();
  return _client;
}

export const client: Action1Client = new Proxy({} as Action1Client, {
  get(_target, prop) {
    const instance = getInstance();
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(instance);
    }
    return value;
  },
});
