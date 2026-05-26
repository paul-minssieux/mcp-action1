import { describe, it, expect } from "vitest";
import { allTools } from "../src/tools/index.js";

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
