import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const schemaNames = [
  "identity.schema.json",
  "registry-entry.schema.json",
  "agent-manifest.schema.json",
  "workflow-definition.schema.json"
];

const schemaDirectory = resolve("packages/contracts/schemas");
const ids = new Set();
const schemas = new Map();

function collectRefs(value, refs = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, refs);
  } else if (value && typeof value === "object") {
    if (typeof value.$ref === "string") refs.push(value.$ref);
    for (const child of Object.values(value)) collectRefs(child, refs);
  }
  return refs;
}

function resolvePointer(document, pointer) {
  if (!pointer) return document;
  return pointer
    .replace(/^#\//, "")
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((value, part) => value?.[part], document);
}

for (const schemaName of schemaNames) {
  const source = await readFile(resolve(schemaDirectory, schemaName), "utf8");
  const schema = JSON.parse(source);
  schemas.set(schemaName, schema);

  if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
    throw new Error(`${schemaName}: expected JSON Schema draft 2020-12`);
  }

  if (typeof schema.$id !== "string" || !schema.$id.startsWith("https://schemas.truaxiom.llc/tip/")) {
    throw new Error(`${schemaName}: missing canonical TIP schema ID`);
  }

  if (ids.has(schema.$id)) throw new Error(`${schemaName}: duplicate schema ID ${schema.$id}`);
  ids.add(schema.$id);

  if (schema.type !== "object" || !schema.properties || !Array.isArray(schema.required)) {
    throw new Error(`${schemaName}: schema must define an object with properties and required fields`);
  }

  const missingProperties = schema.required.filter((field) => !(field in schema.properties));
  if (missingProperties.length > 0) {
    throw new Error(`${schemaName}: required fields lack properties: ${missingProperties.join(", ")}`);
  }

  if (new Set(schema.required).size !== schema.required.length) {
    throw new Error(`${schemaName}: required fields must be unique`);
  }
}

for (const [schemaName, schema] of schemas) {
  for (const ref of collectRefs(schema)) {
    const [targetName, pointer = ""] = ref.split("#");
    const targetSchema = targetName ? schemas.get(targetName) : schema;
    if (!targetSchema) throw new Error(`${schemaName}: unresolved schema reference ${ref}`);
    if (pointer && resolvePointer(targetSchema, `#${pointer}`) === undefined) {
      throw new Error(`${schemaName}: unresolved JSON pointer ${ref}`);
    }
  }
}

console.log(`TIP foundation contract check passed. ${schemaNames.length} schemas verified.`);
