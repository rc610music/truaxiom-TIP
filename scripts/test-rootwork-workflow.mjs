import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { rootWorkContentIntelligenceServiceId, rootWorkContentReviewWorkflowId } from "../packages/core/src/index.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertMatchesSchema(schema, value, path) {
  if (schema.type === "object") {
    assert(value && typeof value === "object" && !Array.isArray(value), `${path} must be an object`);
    for (const key of schema.required ?? []) {
      assert(Object.prototype.hasOwnProperty.call(value, key), `${path} missing ${key}`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        assert(schema.properties?.[key], `${path} has unexpected property ${key}`);
      }
    }
    for (const [key, property] of Object.entries(schema.properties ?? {})) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        assertMatchesSchema(property, value[key], `${path}.${key}`);
      }
    }
    return;
  }

  if (schema.type === "array") {
    assert(Array.isArray(value), `${path} must be an array`);
    if (schema.minItems) assert(value.length >= schema.minItems, `${path} is shorter than ${schema.minItems}`);
    if (schema.uniqueItems) assert(new Set(value.map((item) => JSON.stringify(item))).size === value.length, `${path} must be unique`);
    for (const [index, item] of value.entries()) {
      assertMatchesSchema(schema.items, item, `${path}[${index}]`);
    }
    return;
  }

  if (schema.type === "string") {
    assert(typeof value === "string" && value.length >= (schema.minLength ?? 0), `${path} must be a non-empty string`);
    if (schema.enum) assert(schema.enum.includes(value), `${path} must be one of ${schema.enum.join(", ")}`);
    if (Object.prototype.hasOwnProperty.call(schema, "const")) assert(value === schema.const, `${path} must be ${schema.const}`);
    return;
  }

  if (schema.type === "boolean") {
    assert(typeof value === "boolean", `${path} must be a boolean`);
    return;
  }

  if (schema.type === "integer") {
    assert(Number.isInteger(value), `${path} must be an integer`);
    return;
  }

  throw new Error(`${path} uses an unsupported schema type ${schema.type}`);
}

const workflowSchema = JSON.parse(await readFile(resolve("packages/contracts/schemas/workflow-definition.schema.json"), "utf8"));
const identitySchema = JSON.parse(await readFile(resolve("packages/contracts/schemas/identity.schema.json"), "utf8"));
const workflow = JSON.parse(await readFile(resolve("packages/contracts/workflows/WF-ROOTWORK-CONTENT-REVIEW.json"), "utf8"));
const service = JSON.parse(await readFile(resolve("packages/contracts/identities/SVC-ROOTWORK-CONTENT-INTELLIGENCE.json"), "utf8"));

assertMatchesSchema(workflowSchema, workflow, "WF-ROOTWORK-CONTENT-REVIEW");
assertMatchesSchema(identitySchema, service, "SVC-ROOTWORK-CONTENT-INTELLIGENCE");

assert(workflow.workflow_id === rootWorkContentReviewWorkflowId, "Workflow id must match the runtime constant.");
assert(service.identity_id === rootWorkContentIntelligenceServiceId, "Service id must match the runtime constant.");
assert(workflow.owner === service.identity_id, "Workflow owner must be the RootWork content service.");
assert(service.kind === "service", "RootWork content intelligence must be a service.");
assert(!JSON.stringify(workflow).includes("AGT-0001"), "The workflow must not name the planned RootWork agent.");
assert(!JSON.stringify(service).includes("AGT-0001") || service.description.includes("AGT-0001 stays"), "The service must not promote AGT-0001.");

const stepIds = workflow.steps.map((step) => step.step_id);
assert(workflow.entry_step_id === "crawl.read", "Workflow must enter at crawl.read.");
for (const requiredStep of ["crawl.read", "candidates.propose", "human.approve", "record.persist"]) {
  assert(stepIds.includes(requiredStep), `Workflow is missing step ${requiredStep}.`);
}
for (const step of workflow.steps) {
  assert(stepIds.includes(step.step_id), `Duplicate check failed for ${step.step_id}.`);
  assert(!step.actor_identity_id.startsWith("AGT-"), `${step.step_id} must not use an agent actor.`);
  for (const next of step.next_step_ids) {
    assert(stepIds.includes(next), `${step.step_id} points at missing step ${next}.`);
  }
}
assert(workflow.steps.find((step) => step.step_id === "human.approve")?.requires_approval === true, "Human approval must require approval.");
assert(workflow.steps.find((step) => step.step_id === "record.persist")?.actor_identity_id === "SVC-CONTENT-RECORD", "Persist step must use the content record service.");

console.log("RootWork content review workflow tests passed.");
