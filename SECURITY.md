# Security Review & Hardening — Action1 RMM MCP Server

This document records a security review of this MCP server and the hardening
applied so it can be operated safely by Clauger as a self-hosted container.

## 1. What this server can do (threat model)

This is **not** a passive, read-only connector. Through the Action1 RMM API it
can perform high-impact actions across the entire managed Windows fleet:

- **`run_script`** — execute arbitrary library scripts on endpoints (effectively
  remote code execution on managed machines).
- **`deploy_software` / `deploy_updates`** — install packages/patches, with
  optional automatic reboots.
- **`delete_endpoint`** — unmanage/uninstall the agent from a device.
- **`create_automation` / `update_automation` / `delete_automation`** — schedule
  recurring deployments.
- **`delete_endpoint_group`, `add_endpoint_to_group`, `update_endpoint`** — fleet
  organisation changes.

Anyone able to invoke these tools effectively has administrative control over the
fleet. **Access control and target scoping are therefore the dominant risks**,
not the code itself.

## 2. Findings from the code review

The original codebase was clean and free of malicious or obviously dangerous
code. Specifically:

- ✅ No telemetry, no calls to third parties other than the configured Action1
  region endpoint.
- ✅ Secrets (client id/secret) are read from environment variables and are
  **never logged**; the logger writes to `stderr` only.
- ✅ Good input validation: `org_id` is strictly validated as a UUID and other
  resource IDs are constrained to `^[a-zA-Z0-9_-]+$`, which blocks path
  traversal and URL/command injection (covered by unit tests).
- ✅ Robust HTTP handling: retries with backoff, `Retry-After` handling, bearer
  token caching with expiry.
- ✅ Dependencies are mainstream and pinned via `package-lock.json`
  (`npm audit` reports 0 vulnerabilities).

### Issues identified

| # | Severity | Issue | Status |
|---|----------|-------|--------|
| 1 | **High** | **No authentication/authorization on the server itself.** Over stdio, anyone who can reach the process can drive the Action1 API with the stored credentials. There was no notion of "who" is calling. | **Fixed** — Entra ID OAuth + group enforcement added for the HTTP transport. |
| 2 | **High** | **Accidental fleet-wide blast radius.** `buildEndpoints()` silently defaulted to **ALL** endpoints when no target was supplied. An LLM omitting `endpoint_ids`/`group_ids` would deploy software / run scripts / patch *every* machine. | **Fixed** — now refuses unless `ACTION1_ALLOW_ALL_ENDPOINTS=true`. |
| 3 | Medium | No way to expose the server in a reduced, read-only capacity. | **Fixed** — `ACTION1_READONLY=true` disables all mutating tools. |
| 3b | Medium | No intermediate profile between "full admin" and "read-only": helpdesk operators who need to remediate a single device had to be given the full catalog, including fleet-wide and destructive tools. | **Fixed** — `ACTION1_PROFILE=helpdesk` exposes a reduced catalog and enforces single-endpoint targeting server-side. |
| 4 | Low | Retry backoff multiplied the server-provided `Retry-After` value (`retryAfterDelay * 2`), so the server waits longer than requested. Functional, slightly suboptimal. | Noted, left as-is (low impact). |
| 5 | Info | Error messages from the Action1 API are passed through to the client. They may contain organisational detail; acceptable for an internal tool. | Accepted. |

## 3. Is it safe to run for Clauger?

**Yes, with the hardening in this branch and the deployment guidance below.** The
server's power comes entirely from the Action1 credentials it holds, so safety
depends on:

1. **Who can call it** — now enforced via Entra ID: only members of a designated
   security group obtain a valid token (HTTP transport). See below.
2. **What it can hit** — scope the Action1 API credential to the minimum
   organisations/permissions needed, and keep `ACTION1_ALLOW_ALL_ENDPOINTS`
   unset so destructive tools must be explicitly targeted.
3. **Where it runs** — a container on Clauger infrastructure, behind TLS, with
   secrets injected from a secret manager (not baked into the image).

## 4. Hardening applied in this branch

- **Entra ID (Azure AD) authentication** on the Streamable HTTP transport. Every
  request must carry a valid bearer token; the token's signature, issuer,
  audience and expiry are verified against the tenant JWKS, and the caller must
  be a member of `ENTRA_REQUIRED_GROUP_ID` (or hold `ENTRA_REQUIRED_APP_ROLE`).
- **Fleet-wide targeting guard** (`ACTION1_ALLOW_ALL_ENDPOINTS`, default off).
- **Read-only mode** (`ACTION1_READONLY`).
- **Helpdesk exposure profile** (`ACTION1_PROFILE=helpdesk`): hides agent
  removal, group/automation management, discovery, reports and org-wide
  requeries, and makes `deploy_updates` / `deploy_software` / `run_script`
  refuse any target other than exactly one `endpoint_id` (group targeting
  rejected). The check lives in the tool handlers, so a prompt-injected or
  confused LLM cannot bypass it. Unknown profile values fail closed at startup.
- **Hardened container**: multi-stage build, production-only dependencies,
  non-root `node` user, healthcheck, secrets via environment.

## 5. Operational recommendations

- Terminate TLS in front of the container (reverse proxy / ingress) and set
  `MCP_PUBLIC_URL` to the public `https://` URL.
- Store `ACTION1_CLIENT_SECRET` and Entra values in a secret manager.
- Start with `ACTION1_READONLY=true` to validate the integration, then enable
  mutating tools deliberately.
- Run one instance per audience: an `ACTION1_PROFILE=helpdesk` instance bound to
  the helpdesk operators' Entra ID group, and a `full` instance reserved for
  fleet managers. Keep `delete_endpoint` usage in the Action1 console rather
  than through AI tooling.
- Use a least-privilege Action1 API credential scoped to the intended
  organisation(s).
- Monitor `get_activity_logs` / Action1 audit logs and review the container's
  `stderr` logs (which record every API request and every denied token).
