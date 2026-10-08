import assert from "node:assert/strict";
import { routeDelegation, resolveAgent } from "../packages/core/src/taxisRuntime.ts";

const agents = [
  {
    agentId: "AGENT-RESEARCH",
    lifecycleState: "active",
    capabilities: ["research.web"],
    permissions: ["web.read"],
    autonomyLevel: "execute",
    priority: 5
  },
  {
    agentId: "AGENT-PAUSED",
    lifecycleState: "paused",
    capabilities: ["research.web"],
    permissions: ["web.read"],
    autonomyLevel: "execute",
    priority: 99
  },
  {
    agentId: "AGENT-DEPLOY",
    lifecycleState: "active",
    capabilities: ["deploy.candidate"],
    permissions: ["deploy.candidate.write"],
    autonomyLevel: "execute_with_approval",
    priority: 10
  }
];

assert.equal(resolveAgent(agents, { capabilityId: "research.web", requiredPermissions: ["web.read"] })?.agentId, "AGENT-RESEARCH");
assert.equal(resolveAgent(agents, { capabilityId: "research.web", requiredPermissions: ["secret.read"] }), null);

const safe = routeDelegation(agents, {
  missionId: "MISSION-001",
  requestedBy: "DOT",
  requirement: { capabilityId: "research.web", requiredPermissions: ["web.read"], riskTier: "low" }
});
assert.equal(safe.status, "assigned");
assert.equal(safe.assignedAgentId, "AGENT-RESEARCH");

const gated = routeDelegation(agents, {
  missionId: "MISSION-002",
  requestedBy: "DOT",
  requirement: { capabilityId: "deploy.candidate", requiredPermissions: ["deploy.candidate.write"], riskTier: "high" }
});
assert.equal(gated.status, "needs_approval");
assert.equal(gated.assignedAgentId, "AGENT-DEPLOY");

const unroutable = routeDelegation(agents, {
  missionId: "MISSION-003",
  requestedBy: "DOT",
  requirement: { capabilityId: "billing.change", requiredPermissions: ["billing.write"], riskTier: "critical" }
});
assert.equal(unroutable.status, "unroutable");

console.log("TIP Runtime 001 Taxis tests passed.");
