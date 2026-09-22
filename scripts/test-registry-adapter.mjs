import {
  createInMemoryRepository,
  createPostgresRegistryRepository,
  createTipApiGateway,
  createTipBootstrapSnapshot,
  overlayRegistryOnSnapshot,
  postgresRegistrySql,
  registryV1,
  registryV1Products,
  rowToProduct
} from "../packages/core/src/index.ts";

const expectedNames = ["TIP", "Command Center", "RootWork", "V!B^n", "Prep\u2019Pay", "Kronike", "FlowFeed", "DotDizzy"];
const actualNames = registryV1Products.map((product) => product.name);

if (actualNames.join("|") !== expectedNames.join("|")) {
  throw new Error(`Registry v1 product names drifted: ${actualNames.join(", ")}`);
}

if (registryV1.organizations.length !== 1 || registryV1.organizations[0].id !== "ORG-TRUAXIOM") {
  throw new Error("Registry v1 must keep the shared ORG-TRUAXIOM row.");
}

if (registryV1.projects.length !== 8) {
  throw new Error("Registry v1 must include one project row per product.");
}

for (const product of registryV1.products) {
  const project = registryV1.projects.find((item) => item.productId === product.id);
  if (!project) throw new Error(`Missing project row for ${product.id}`);
}

const overlaid = overlayRegistryOnSnapshot(createTipBootstrapSnapshot(), registryV1);
if (overlaid.products.some((product) => product.id === "PROD-BOOGIE-LAB")) {
  throw new Error("Registry overlay must replace the seed product catalog.");
}
if (overlaid.knowledgeObjects.length !== 2 || overlaid.tasks.length !== 3) {
  throw new Error("Registry overlay must leave non-registry seed collections in place.");
}

const calls = [];
const repository = createPostgresRegistryRepository({
  async query(sql) {
    calls.push(sql);
    if (sql === postgresRegistrySql.listOrganizations) {
      return [{
        id: "ORG-TRUAXIOM",
        name: "TruaXiom LLC",
        description: "from neon",
        mission: "mission",
        vision: "vision",
        values: ["Practical innovation"],
        domains: ["AI integration"],
        status: "active",
        created_at: new Date("2026-09-22T00:00:00.000Z"),
        updated_at: new Date("2026-09-22T00:00:00.000Z")
      }];
    }
    if (sql === postgresRegistrySql.listProducts) {
      return [{
        id: "PROD-DOTDIZZY",
        organization_id: "ORG-TRUAXIOM",
        name: "DotDizzy",
        description: "from neon",
        category: "website",
        stage: "production",
        status: "active",
        public_url: "https://dotdizzy.com",
        repository: null,
        tags: ["registry-v1"],
        created_at: "2026-09-22T00:00:00.000Z",
        updated_at: "2026-09-22T00:00:00.000Z"
      }];
    }
    if (sql === postgresRegistrySql.listProjects) {
      return [{
        id: "PRJ-DOTDIZZY",
        organization_id: "ORG-TRUAXIOM",
        product_id: "PROD-DOTDIZZY",
        name: "DotDizzy",
        description: "from neon",
        priority: "medium",
        sprint: null,
        next_action: null,
        status: "active",
        tags: ["registry-v1"],
        created_at: "2026-09-22T00:00:00.000Z",
        updated_at: "2026-09-22T00:00:00.000Z"
      }];
    }
    return [];
  }
});

const reconciled = await repository.reconcile(registryV1);
const mapped = rowToProduct({
  id: reconciled.products[0].id,
  organization_id: reconciled.products[0].organizationId,
  name: reconciled.products[0].name,
  category: reconciled.products[0].category,
  stage: reconciled.products[0].stage,
  status: reconciled.products[0].status,
  public_url: reconciled.products[0].publicUrl,
  tags: reconciled.products[0].tags,
  created_at: reconciled.products[0].createdAt,
  updated_at: reconciled.products[0].updatedAt
});

if (mapped.name !== "DotDizzy" || mapped.publicUrl !== "https://dotdizzy.com") {
  throw new Error("Product row mapping did not preserve Neon columns.");
}

if (calls.filter((sql) => sql === postgresRegistrySql.upsertOrganization).length !== 1) {
  throw new Error("Reconcile must upsert the organization before products.");
}
if (calls.filter((sql) => sql === postgresRegistrySql.upsertProduct).length !== 8) {
  throw new Error("Reconcile must upsert all eight Registry v1 products.");
}
if (calls.filter((sql) => sql === postgresRegistrySql.upsertProject).length !== 8) {
  throw new Error("Reconcile must upsert all eight Registry v1 projects.");
}

const orgIndex = calls.indexOf(postgresRegistrySql.upsertOrganization);
const firstProductIndex = calls.indexOf(postgresRegistrySql.upsertProduct);
const firstProjectIndex = calls.indexOf(postgresRegistrySql.upsertProject);
if (!(orgIndex < firstProductIndex && firstProductIndex < firstProjectIndex)) {
  throw new Error("Reconcile must write organizations, then products, then projects.");
}

const snapshot = overlayRegistryOnSnapshot(createTipBootstrapSnapshot(), reconciled);
const gateway = createTipApiGateway({
  repository: createInMemoryRepository(snapshot),
  modeLabel: "api",
  persistenceLabel: "postgres-review-decision-repository",
  registryMeta: {
    version: "v1",
    source: "postgres",
    configuredProvider: "postgres"
  }
});

const health = await gateway.handleAsync({ method: "GET", path: "/health" });
const registry = await gateway.handleAsync({ method: "GET", path: "/v1/registry" });

if (health.body.registry?.counts?.products !== 1 || health.body.persistenceMap?.products !== "postgres") {
  throw new Error("Health did not report the Postgres registry readback.");
}
if (health.body.persistenceMap?.tasks !== "in-memory-seed" || health.body.persistenceMap?.reviewDecisions !== "postgres") {
  throw new Error("Health persistence map drifted from the seed-versus-Postgres boundary.");
}
if (health.body.summary?.[1] !== "1 product record(s)") {
  throw new Error("Health summary must follow the overlaid registry, not the six-product seed.");
}
if (registry.body?.source !== "postgres" || registry.body?.products?.[0]?.name !== "DotDizzy") {
  throw new Error("Registry route must return the Postgres readback rows.");
}
if (health.body.reviewDecisions?.table !== "tip_review_decisions") {
  throw new Error("Health must identify tip_review_decisions as the durable review table.");
}

console.log("TIP Registry v1 adapter test passed.");
