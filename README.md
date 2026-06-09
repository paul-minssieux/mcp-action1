# Action1 RMM MCP Server

An unofficial and fully featured Model Context Protocol (MCP) server for the **Action1 RMM REST API**. 

This server exposes Action1's remote monitoring and management (RMM) capabilities as actionable tools for AI coding assistants and agents (such as Gemini CLI, Claude Desktop, Cursor, Cline, and custom GenAI applications). It allows AI models to inspect endpoints, deploy updates/patches, run scripts, manage groups, and trigger software deployments.

---

## 🚀 Features

- **Organization & Authenticated User Info**: Retrieve API permissions and list accessible organizations.
- **Endpoint Monitoring**: List managed devices, query detailed system statuses, update device attributes, and fetch discovered (unmanaged) devices on the network.
- **Vulnerability & Update Management**: List pending CVE vulnerabilities, scan Windows update statuses, and trigger telemetry refreshes.
- **Task & Policy Deployments**:
  - **Patching**: Deploy Windows updates / CVE mitigations with customizable reboots.
  - **Software**: Deploy packages from the Action1 Software Repository.
  - **Scripts**: Execute library scripts with parameter overrides.
- **Automation & Scheduling**: List, create, update, and remove recurring automation schedules.
- **Reporting & Activity Logs**: List and retrieve data rows for custom reports, export reports to CSV, and access audit/activity logs.

---

## 📋 Prerequisites

- **Node.js**: `v18.0.0` or higher
- **Action1 Account**: Access to an Action1 RMM console.
- **API Credentials**: Client ID and Client Secret created in Action1 under **Configuration > Users & API Credentials**.

---

## 🛠️ Installation & Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and fill in your Action1 credentials:
   ```bash
   cp .env.example .env
   ```
   Modify the `.env` file:
   ```env
   ACTION1_CLIENT_ID=api-key-your-client-id@action1.com
   ACTION1_CLIENT_SECRET=your_client_secret_here
   ACTION1_REGION=na # na (default), eu, or au
   ACTION1_ORG_ID=your_default_organization_id # optional — can be passed per-tool call
   ```

3. **Build the Server**:
   Compile the TypeScript source files to JavaScript:
   ```bash
   npm run build
   ```

---

## 🔍 Running and Testing Locally

MCP servers communicate over `stdio` (standard input/output). Testing them in a standard terminal shell will block waiting for JSON-RPC messages. To test and verify tools interactively, use the **MCP Inspector**:

```bash
# Start the MCP Inspector (local environment variables in .env are loaded automatically!)
npx @modelcontextprotocol/inspector node dist/index.js
```

This will spin up a web interface (typically at `http://localhost:5173`) where you can interactively invoke tools, inspect inputs, and verify outputs.

To run with live-reloading during TypeScript development:
```bash
npx @modelcontextprotocol/inspector npx tsx src/index.ts
```

### 🧪 Running Automated Tests

The codebase includes a comprehensive unit testing suite using **Vitest** to verify Zod input schemas (UUID matching, strict alphanumeric/hyphen ID constraints, and numeric paging limits).

To execute the test suite:
```bash
npm test
```

---

## ⚙️ Host Integrations

Here is how you can connect this server to popular AI clients:

### 1. Gemini CLI (`gemini`)
Create or edit your local project settings in `.gemini/settings.json` (or globally in `~/.gemini/settings.json`):

```json
{
  "mcpServers": {
    "action1": {
      "command": "node",
      "args": ["/path/to/mcp-action1/dist/index.js"],
      "env": {
        "ACTION1_CLIENT_ID": "api-key-your-client-id@action1.com",
        "ACTION1_CLIENT_SECRET": "your-client-secret",
        "ACTION1_REGION": "na",
        "ACTION1_ORG_ID": "your-org-id"
      }
    }
  }
}
```

### 2. Claude Desktop
Add the following to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "action1": {
      "command": "node",
      "args": ["/path/to/mcp-action1/dist/index.js"],
      "env": {
        "ACTION1_CLIENT_ID": "api-key-your-client-id@action1.com",
        "ACTION1_CLIENT_SECRET": "your-client-secret",
        "ACTION1_REGION": "na",
        "ACTION1_ORG_ID": "your-org-id"
      }
    }
  }
}
```

### 3. Cursor
1. Navigate to **Cursor Settings > Features > MCP**.
2. Click **+ Add New MCP Server**.
3. Choose Type: `command`
4. Set Command: `node /path/to/mcp-action1/dist/index.js`
5. Configure environmental variables matching your `.env` values.

---

## 🐳 Remote Deployment: Container + HTTP Streamable + Entra ID

In addition to the local `stdio` transport, the server can run as a long-lived
HTTP service (MCP **Streamable HTTP** transport) inside a container, protected by
**Microsoft Entra ID (Azure AD)** so that only members of a designated security
group may use it. This is the recommended way to attach it to Claude as a remote
connector.

> See [`SECURITY.md`](./SECURITY.md) for the full security review and the
> rationale behind the safety controls described here.

### Transport selection

| `MCP_TRANSPORT` | Behaviour |
|-----------------|-----------|
| `stdio` (default) | Local desktop clients (Claude Desktop, Cursor, …). No auth — relies on the host. |
| `http` | Streamable HTTP on `PORT` (default 3000), endpoint `POST /mcp`, protected by Entra ID. |

### How authentication works

The server acts as an OAuth 2.0 **resource server**:

1. It advertises OAuth Protected Resource Metadata at
   `/.well-known/oauth-protected-resource/mcp`, pointing to your Entra tenant as
   the authorization server.
2. Unauthenticated requests receive `401` with a `WWW-Authenticate` header so the
   MCP client knows where to obtain a token.
3. Each request's bearer token is verified (signature via tenant JWKS, issuer,
   audience, expiry). The caller must be a **member of
   `ENTRA_REQUIRED_GROUP_ID`** (or hold `ENTRA_REQUIRED_APP_ROLE`), otherwise the
   request is rejected with `403`.

### Entra ID app registration (one-time)

1. **Register an application** in Entra ID to represent this API. Note the
   **Directory (tenant) ID** and **Application (client) ID**.
2. Under **Expose an API**, set the Application ID URI (e.g.
   `api://<client-id>`) and add a scope (e.g. `mcp.access`).
3. Under **Token configuration**, add a **groups claim** for access tokens
   (Security groups). This makes the `groups` claim available for enforcement.
   - If users may belong to **>200 groups** (Entra "groups overage"), define an
     **App Role** instead and assign it to the group, then set
     `ENTRA_REQUIRED_APP_ROLE` to that role value.
4. Create / identify the **security group** that should be allowed, and copy its
   **object ID** into `ENTRA_REQUIRED_GROUP_ID`. Assign your users to it.

### Configuration (environment variables)

| Variable | Required | Description |
|----------|----------|-------------|
| `MCP_TRANSPORT` | yes (`http`) | Set to `http` to enable the HTTP transport. |
| `PORT` | no | HTTP port (default `3000`). |
| `MCP_PUBLIC_URL` | yes | Public `https://` base URL of the server (used in OAuth metadata). |
| `ENTRA_TENANT_ID` | yes | Directory (tenant) ID. |
| `ENTRA_CLIENT_ID` | yes | Application (client) ID of the API registration (expected token audience). |
| `ENTRA_REQUIRED_GROUP_ID` | yes | Object ID of the allowed security group. |
| `ENTRA_AUDIENCE` | no | Comma-separated audience override (defaults to `<client-id>,api://<client-id>`). |
| `ENTRA_REQUIRED_APP_ROLE` | no | Require an app role instead of / in addition to group membership. |
| `ACTION1_CLIENT_ID` / `ACTION1_CLIENT_SECRET` | yes | Action1 API credentials. |
| `ACTION1_REGION` | no | `na` (default), `eu`, `au`. |
| `ACTION1_ORG_ID` | no | Default organization ID. |
| `ACTION1_ALLOW_ALL_ENDPOINTS` | no | `false` by default. When `false`, deploy/run tools refuse to run without explicit `group_ids`/`endpoint_ids` (prevents accidental fleet-wide changes). |
| `ACTION1_READONLY` | no | `true` exposes only read-only inspection tools. |

### Run with Docker

```bash
# Build
docker build -t mcp-action1 .

# Run (inject secrets from your environment / secret manager)
docker run --rm -p 3000:3000 \
  -e MCP_TRANSPORT=http \
  -e MCP_PUBLIC_URL=https://mcp-action1.example.com \
  -e ACTION1_CLIENT_ID=... -e ACTION1_CLIENT_SECRET=... -e ACTION1_REGION=eu \
  -e ENTRA_TENANT_ID=... -e ENTRA_CLIENT_ID=... -e ENTRA_REQUIRED_GROUP_ID=... \
  mcp-action1
```

Or with Compose (reads values from a `.env` file):

```bash
docker compose up --build
```

Terminate TLS in front of the container (reverse proxy / ingress) and point
`MCP_PUBLIC_URL` at the public HTTPS URL. Probe health at `GET /healthz`.

### Attach to Claude

Add a custom connector pointing at `https://<your-host>/mcp`. Claude will follow
the advertised metadata to authenticate against Entra ID; only users in the
configured group will be authorized.

---

## 🛠️ Tool Catalog

This MCP server registers the following tools under standard schemas:

### Organizations
- `get_me`: Get information about the currently authenticated API user.
- `list_organizations`: List all organizations accessible to the API credentials.

### Endpoints (Devices)
- `list_endpoints`: List managed endpoints (agents). Supports pagination, cursors, and extended fields (e.g. patch status).
- `get_endpoint`: Get detailed telemetry information about a single device.
- `update_endpoint`: Update device properties (name, comment, custom attributes).
- `delete_endpoint`: Remove/unmanage a device (uninstalls the agent).
- `list_discovery_endpoints`: List unmanaged/discovered devices seen on the network.
- `requery_installed_apps`: Force a refresh of installed app inventory on endpoints.
- `requery_installed_updates`: Force a scan of Windows updates on endpoints.

### Groups
- `list_endpoint_groups`: List all defined endpoint groups in the organization.
- `get_endpoint_group_contents`: List member devices of a specific group.
- `add_endpoint_to_group`: Add endpoints to a target group.
- `update_endpoint_group`: Edit group names or descriptions.
- `delete_endpoint_group`: Remove an endpoint group.

### Vulnerabilities & Updates
- `list_vulnerabilities`: List known CVE vulnerabilities detected across endpoints. Filterable by severity.
- `list_windows_updates`: List missing Windows updates across endpoints.

### Scripts & Software
- `list_scripts`: List script library catalog (both built-in and custom script templates).
- `list_packages`: List all software packages available in the managed Action1 catalog.
- `list_software_repository`: List packages in the local repository and retrieve versions.
- `list_installed_apps`: List currently installed apps across all endpoints.

### Deployment & Policies
- `list_policies`: List past and active one-time deployment instances (software, patches, scripts).
- `get_policy`: Retrieve configuration and target scope details of a policy.
- `get_policy_results`: Fetch per-endpoint execution results (success/failure details).
- `deploy_updates`: Run a deployment job to install patches/updates. Supports targeting specific CVEs, automatic reboots, and retry windows.
- `deploy_software`: Deploy a software catalog package to target groups or endpoints.
- `run_script`: Execute a script library item with arguments and reboot rules.

### Automation Schedules
- `list_automations`: List configured recurring automations.
- `create_automation`: Build a daily, weekly, or monthly recurring deployment automation schedule.
- `update_automation`: Edit or toggle an automation.
- `delete_automation`: Delete an automation schedule.

### Reporting & Logs
- `list_reports`: Retrieve a catalog of all available built-in reports.
- `get_report_data`: Retrieve raw data rows for a target report.
- `export_report`: Export report rows directly to CSV format.
- `requery_report`: Trigger a data refresh for a specific report.
- `get_activity_logs`: Retrieve organization-wide action and audit logs.
- `list_setting_templates`: List templates used for configuration profiles.

---

## 📜 License

This project is licensed under the MIT License. Refer to `LICENSE` for details.
