import type { Organization, Product, Project, TipRepositorySnapshot } from "@truaxiom/types";
import type { PostgresQueryExecutor } from "./postgresReviewDecisionAdapter";
import type { RegistryRecords } from "./registryV1";

export const registrySchemaSql = `
  create table if not exists organizations (
    id text primary key,
    name text not null,
    description text,
    mission text,
    vision text,
    values jsonb default '[]'::jsonb,
    domains jsonb default '[]'::jsonb,
    status text not null default 'active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create table if not exists products (
    id text primary key,
    organization_id text not null references organizations(id),
    name text not null,
    description text,
    category text not null,
    stage text not null,
    status text not null default 'planned',
    public_url text,
    repository text,
    tags jsonb default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create table if not exists projects (
    id text primary key,
    organization_id text not null references organizations(id),
    product_id text references products(id),
    name text not null,
    description text,
    priority text not null default 'medium',
    sprint text,
    next_action text,
    status text not null default 'planned',
    tags jsonb default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
`;

export const postgresRegistrySql = {
  upsertOrganization: `
    insert into organizations (
      id, name, description, mission, vision, values, domains, status, created_at, updated_at
    ) values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10)
    on conflict (id) do update set
      name = excluded.name,
      description = excluded.description,
      mission = excluded.mission,
      vision = excluded.vision,
      values = excluded.values,
      domains = excluded.domains,
      status = excluded.status,
      updated_at = excluded.updated_at
    returning *;
  `,
  upsertProduct: `
    insert into products (
      id, organization_id, name, description, category, stage, status, public_url, repository, tags, created_at, updated_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
    on conflict (id) do update set
      organization_id = excluded.organization_id,
      name = excluded.name,
      description = excluded.description,
      category = excluded.category,
      stage = excluded.stage,
      status = excluded.status,
      public_url = excluded.public_url,
      repository = excluded.repository,
      tags = excluded.tags,
      updated_at = excluded.updated_at
    returning *;
  `,
  upsertProject: `
    insert into projects (
      id, organization_id, product_id, name, description, priority, sprint, next_action, status, tags, created_at, updated_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
    on conflict (id) do update set
      organization_id = excluded.organization_id,
      product_id = excluded.product_id,
      name = excluded.name,
      description = excluded.description,
      priority = excluded.priority,
      sprint = excluded.sprint,
      next_action = excluded.next_action,
      status = excluded.status,
      tags = excluded.tags,
      updated_at = excluded.updated_at
    returning *;
  `,
  listOrganizations: `select * from organizations order by id;`,
  listProducts: `select * from products order by id;`,
  listProjects: `select * from projects order by id;`
};

export function overlayRegistryOnSnapshot(snapshot: TipRepositorySnapshot, registry: RegistryRecords): TipRepositorySnapshot {
  return {
    ...snapshot,
    organizations: registry.organizations,
    products: registry.products,
    projects: registry.projects
  };
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value;
  return new Date(0).toISOString();
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function rowToOrganization(row: Record<string, unknown>): Organization {
  return {
    id: String(row.id),
    name: String(row.name),
    description: asOptionalString(row.description),
    mission: typeof row.mission === "string" ? row.mission : "",
    vision: typeof row.vision === "string" ? row.vision : "",
    values: asStringArray(row.values),
    domains: asStringArray(row.domains),
    status: row.status as Organization["status"],
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at)
  };
}

export function rowToProduct(row: Record<string, unknown>): Product {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    name: String(row.name),
    description: asOptionalString(row.description),
    category: row.category as Product["category"],
    stage: row.stage as Product["stage"],
    status: row.status as Product["status"],
    publicUrl: asOptionalString(row.public_url),
    repository: asOptionalString(row.repository),
    tags: asStringArray(row.tags),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at)
  };
}

export function rowToProject(row: Record<string, unknown>): Project {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    productId: asOptionalString(row.product_id),
    name: String(row.name),
    description: asOptionalString(row.description),
    priority: row.priority as Project["priority"],
    sprint: asOptionalString(row.sprint),
    nextAction: asOptionalString(row.next_action),
    status: row.status as Project["status"],
    tags: asStringArray(row.tags),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at)
  };
}

function organizationParams(organization: Organization): unknown[] {
  return [
    organization.id,
    organization.name,
    organization.description ?? null,
    organization.mission,
    organization.vision,
    JSON.stringify(organization.values),
    JSON.stringify(organization.domains),
    organization.status,
    organization.createdAt,
    organization.updatedAt
  ];
}

function productParams(product: Product): unknown[] {
  return [
    product.id,
    product.organizationId,
    product.name,
    product.description ?? null,
    product.category,
    product.stage,
    product.status,
    product.publicUrl ?? null,
    product.repository ?? null,
    JSON.stringify(product.tags ?? []),
    product.createdAt,
    product.updatedAt
  ];
}

function projectParams(project: Project): unknown[] {
  return [
    project.id,
    project.organizationId,
    project.productId ?? null,
    project.name,
    project.description ?? null,
    project.priority,
    project.sprint ?? null,
    project.nextAction ?? null,
    project.status,
    JSON.stringify(project.tags ?? []),
    project.createdAt,
    project.updatedAt
  ];
}

export interface PostgresRegistryRepository {
  reconcile(registry: RegistryRecords): Promise<RegistryRecords>;
}

export function createPostgresRegistryRepository(options: { query?: PostgresQueryExecutor } = {}): PostgresRegistryRepository {
  const query = options.query;

  return {
    async reconcile(registry) {
      if (!query) {
        throw new Error("Postgres registry adapter is configured without a query executor.");
      }

      for (const organization of registry.organizations) {
        await query(postgresRegistrySql.upsertOrganization, organizationParams(organization));
      }

      for (const product of registry.products) {
        await query(postgresRegistrySql.upsertProduct, productParams(product));
      }

      for (const project of registry.projects) {
        await query(postgresRegistrySql.upsertProject, projectParams(project));
      }

      const organizations = await query<Record<string, unknown>>(postgresRegistrySql.listOrganizations);
      const products = await query<Record<string, unknown>>(postgresRegistrySql.listProducts);
      const projects = await query<Record<string, unknown>>(postgresRegistrySql.listProjects);

      return {
        organizations: organizations.map(rowToOrganization),
        products: products.map(rowToProduct),
        projects: projects.map(rowToProject)
      };
    }
  };
}
