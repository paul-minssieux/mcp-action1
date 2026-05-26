import { organizationTools } from "./organizations.js";
import { endpointTools } from "./endpoints.js";
import { groupTools } from "./groups.js";
import { policyTools } from "./policies.js";
import { vulnerabilityTools } from "./vulnerabilities.js";
import { scriptTools } from "./scripts.js";
import { packageTools } from "./packages.js";
import { reportTools } from "./reports.js";
import type { Tool } from "./types.js";

export const allTools: Tool[] = [
  ...organizationTools,
  ...endpointTools,
  ...groupTools,
  ...policyTools,
  ...vulnerabilityTools,
  ...scriptTools,
  ...packageTools,
  ...reportTools,
];

export type { Tool };
