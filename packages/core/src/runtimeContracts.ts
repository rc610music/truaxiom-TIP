import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import agent from "../../contracts/schemas/agent-manifest.schema.json";
import capability from "../../contracts/schemas/capability-manifest.schema.json";
import delegation from "../../contracts/schemas/delegation-envelope-v2.schema.json";
import artifact from "../../contracts/schemas/artifact.schema.json";
import state from "../../contracts/schemas/state-event.schema.json";
import permission from "../../contracts/schemas/permission-request.schema.json";
import failure from "../../contracts/schemas/failure-event.schema.json";
import handoff from "../../contracts/schemas/handoff-request.schema.json";
import packet from "../../contracts/schemas/handoff-packet.schema.json";
import mission from "../../contracts/schemas/mission.schema.json";
import command from "../../contracts/schemas/runtime-command.schema.json";
import storedArtifact from "../../contracts/schemas/stored-runtime-artifact.schema.json";

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
for (const schema of [
  agent,
  capability,
  delegation,
  artifact,
  state,
  permission,
  failure,
  handoff,
  packet,
  mission,
  command,
  storedArtifact,
])
  ajv.addSchema(schema);
export class RuntimeError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function validateRuntimeContract(
  name: string,
  value: unknown,
  version = "v1",
): void {
  const validate = ajv.getSchema(
    `https://schemas.truaxiom.llc/tip/${name}/${version}`,
  );
  if (!validate)
    throw new Error(`Unknown runtime contract: ${name}/${version}`);
  if (!validate(value))
    throw new RuntimeError(400, `${name}: ${ajv.errorsText(validate.errors)}`);
}
/** Stable across object key order; authority and idempotency never depend on transport ordering. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
