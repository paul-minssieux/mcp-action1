import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { allTools } from "../src/tools/index.js";
import { getEnabledTools } from "../src/server.js";

describe("MCP-Action1 Input Schema Validation Tests", () => {
  // Helper to retrieve a tool by its registered name
  const getTool = (name: string) => {
    const tool = allTools.find((t) => t.name === name);
    if (!tool) throw new Error(`Tool ${name} not found in allTools`);
    return tool;
  };

  describe("Organization ID (OrgId) UUID Validation", () => {
    it("should accept a valid UUID format", () => {
      const getEndpoint = getTool("get_endpoint");
      const validResult = getEndpoint.inputSchema.safeParse({
        org_id: "123e4567-e89b-12d3-a456-426614174000",
        endpoint_id: "endpoint-1",
      });
      expect(validResult.success).toBe(true);
    });

    it("should reject an invalid org_id format", () => {
      const getEndpoint = getTool("get_endpoint");
      const invalidResult = getEndpoint.inputSchema.safeParse({
        org_id: "invalid-uuid-format",
        endpoint_id: "endpoint-1",
      });
      expect(invalidResult.success).toBe(false);
    });

    it("should reject path traversal in org_id", () => {
      const getEndpoint = getTool("get_endpoint");
      const traversalResult = getEndpoint.inputSchema.safeParse({
        org_id: "../../../etc/passwd",
        endpoint_id: "endpoint-1",
      });
      expect(traversalResult.success).toBe(false);
    });
  });

  describe("Secondary Resource ID Alphanumeric Validation", () => {
    it("should accept standard alphanumeric, hyphen, and underscore IDs", () => {
      const getEndpoint = getTool("get_endpoint");
      const validResult = getEndpoint.inputSchema.safeParse({
        org_id: "123e4567-e89b-12d3-a456-426614174000",
        endpoint_id: "endpoint-123_abc_XYZ",
      });
      expect(validResult.success).toBe(true);
    });

    it("should reject IDs containing spaces", () => {
      const getEndpoint = getTool("get_endpoint");
      const invalidResult = getEndpoint.inputSchema.safeParse({
        org_id: "123e4567-e89b-12d3-a456-426614174000",
        endpoint_id: "endpoint 123",
      });
      expect(invalidResult.success).toBe(false);
    });

    it("should reject IDs containing slashes / path traversal", () => {
      const getEndpoint = getTool("get_endpoint");
      const traversalResult = getEndpoint.inputSchema.safeParse({
        org_id: "123e4567-e89b-12d3-a456-426614174000",
        endpoint_id: "sub_dir/endpoint-1",
      });
      expect(traversalResult.success).toBe(false);
    });

    it("should reject IDs containing command injection or shell metacharacters", () => {
      const runScript = getTool("run_script");
      const injectionResult = runScript.inputSchema.safeParse({
        org_id: "123e4567-e89b-12d3-a456-426614174000",
        name: "Test Run",
        script_id: "script_id; rm -rf /",
      });
      expect(injectionResult.success).toBe(false);
    });
  });

  describe("Fleet-wide targeting safety guard", () => {
    const VALID_ORG = "123e4567-e89b-12d3-a456-426614174000";

    // The Action1 client requires credentials to instantiate; provide dummies.
    // No network call is made — the safety guard throws before any request.
    beforeAll(() => {
      process.env.ACTION1_CLIENT_ID ||= "test-client-id";
      process.env.ACTION1_CLIENT_SECRET ||= "test-client-secret";
    });

    it("should refuse deploy_software with no explicit target when ACTION1_ALLOW_ALL_ENDPOINTS is unset", async () => {
      delete process.env.ACTION1_ALLOW_ALL_ENDPOINTS;
      const deploy = getTool("deploy_software");
      await expect(
        deploy.handler({
          org_id: VALID_ORG,
          name: "test deploy",
          packages: [{ package_id: "pkg_1" }],
        })
      ).rejects.toThrow(/Refusing to target ALL endpoints/);
    });

    it("should refuse run_script with no explicit target when ACTION1_ALLOW_ALL_ENDPOINTS is unset", async () => {
      delete process.env.ACTION1_ALLOW_ALL_ENDPOINTS;
      const runScript = getTool("run_script");
      await expect(
        runScript.handler({
          org_id: VALID_ORG,
          name: "test run",
          script_id: "script_1",
        })
      ).rejects.toThrow(/Refusing to target ALL endpoints/);
    });
  });

  describe("Helpdesk profile (ACTION1_PROFILE=helpdesk)", () => {
    const VALID_ORG = "123e4567-e89b-12d3-a456-426614174000";

    beforeAll(() => {
      process.env.ACTION1_CLIENT_ID ||= "test-client-id";
      process.env.ACTION1_CLIENT_SECRET ||= "test-client-secret";
    });

    afterEach(() => {
      delete process.env.ACTION1_PROFILE;
    });

    it("should expose the full catalog by default", () => {
      delete process.env.ACTION1_PROFILE;
      expect(getEnabledTools().length).toBe(allTools.length);
    });

    it("should hide fleet-scoped mutating tools in helpdesk profile", () => {
      process.env.ACTION1_PROFILE = "helpdesk";
      const names = new Set(getEnabledTools().map((t) => t.name));
      for (const hidden of [
        "delete_endpoint",
        "add_endpoint_to_group",
        "update_endpoint_group",
        "delete_endpoint_group",
        "create_automation",
        "update_automation",
        "delete_automation",
        "list_automations",
        "list_discovery_endpoints",
        "requery_installed_updates",
        "export_report",
        "requery_report",
        "list_setting_templates",
      ]) {
        expect(names.has(hidden), `${hidden} should be hidden`).toBe(false);
      }
      for (const visible of [
        "get_endpoint",
        "list_windows_updates",
        "deploy_updates",
        "deploy_software",
        "run_script",
        "requery_installed_apps",
      ]) {
        expect(names.has(visible), `${visible} should be visible`).toBe(true);
      }
    });

    it("should throw on an unknown ACTION1_PROFILE value", () => {
      process.env.ACTION1_PROFILE = "admin";
      expect(() => getEnabledTools()).toThrow(/Unknown ACTION1_PROFILE/);
    });

    it("should refuse deploy_software targeting a group", async () => {
      process.env.ACTION1_PROFILE = "helpdesk";
      const deploy = getTool("deploy_software");
      await expect(
        deploy.handler({
          org_id: VALID_ORG,
          name: "test deploy",
          packages: [{ package_id: "pkg_1" }],
          group_ids: ["group_1"],
        })
      ).rejects.toThrow(/one endpoint/);
    });

    it("should refuse run_script targeting more than one endpoint", async () => {
      process.env.ACTION1_PROFILE = "helpdesk";
      const runScript = getTool("run_script");
      await expect(
        runScript.handler({
          org_id: VALID_ORG,
          name: "test run",
          script_id: "script_1",
          endpoint_ids: ["endpoint_1", "endpoint_2"],
        })
      ).rejects.toThrow(/one device at a time/);
    });

    it("should refuse deploy_updates with no explicit endpoint", async () => {
      process.env.ACTION1_PROFILE = "helpdesk";
      const deploy = getTool("deploy_updates");
      await expect(
        deploy.handler({ org_id: VALID_ORG, name: "test patch" })
      ).rejects.toThrow(/exactly one endpoint_id/);
    });

    it("should refuse org-wide requery_installed_apps", async () => {
      process.env.ACTION1_PROFILE = "helpdesk";
      const requery = getTool("requery_installed_apps");
      await expect(requery.handler({ org_id: VALID_ORG })).rejects.toThrow(
        /org-wide requery is not allowed/
      );
    });
  });

  describe("Limits and Numeric Boundaries", () => {
    it("should enforce limits inside list_endpoints", () => {
      const listEndpoints = getTool("list_endpoints");
      
      // limit = 500 should succeed
      const validResult = listEndpoints.inputSchema.safeParse({
        org_id: "123e4567-e89b-12d3-a456-426614174000",
        limit: 500,
      });
      expect(validResult.success).toBe(true);

      // limit = 2000 (exceeds max 1000) should fail
      const tooLargeResult = listEndpoints.inputSchema.safeParse({
        org_id: "123e4567-e89b-12d3-a456-426614174000",
        limit: 2000,
      });
      expect(tooLargeResult.success).toBe(false);

      // limit = 0 (below min 1) should fail
      const tooSmallResult = listEndpoints.inputSchema.safeParse({
        org_id: "123e4567-e89b-12d3-a456-426614174000",
        limit: 0,
      });
      expect(tooSmallResult.success).toBe(false);
    });
  });
});
