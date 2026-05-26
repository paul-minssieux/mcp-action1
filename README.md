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
