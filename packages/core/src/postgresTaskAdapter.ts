import type { Priority, Task, TaskWorkflowRun, TaskWorkflowStatus } from "@truaxiom/types";
import { toIsoTimestamp, type PostgresQueryExecutor } from "./postgresReviewDecisionAdapter";

export const approvalTaskTableName = "tasks";
export const seedProjectId = "PRJ-SPRINT-002";

export const approvalTaskSchemaStatements = [
  `
    create table if not exists tasks (
      id text primary key,
      organization_id text references organizations(id),
      product_id text references products(id),
      project_id text references projects(id),
      name text not null,
      description text,
      priority text not null default 'medium',
      status text not null default 'planned',
      due_date timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `,
  "alter table tasks add column if not exists assigned_to text;",
  "alter table tasks add column if not exists recommendation_id text;",
  "alter table tasks add column if not exists workflow_status text;",
  "alter table tasks add column if not exists acceptance_criteria jsonb not null default '[]'::jsonb;",
  "alter table tasks add column if not exists tags jsonb not null default '[]'::jsonb;",
  "alter table tasks add column if not exists evidence jsonb not null default '[]'::jsonb;",
  "alter table tasks add column if not exists workflow jsonb not null default '{}'::jsonb;"
];

export const approvalTaskSchemaSql = approvalTaskSchemaStatements.join("\n");

export const postgresApprovalTaskSql = {
  upsertTask: `
    insert into tasks (
      id,
      organization_id,
      product_id,
      project_id,
      name,
      description,
      priority,
      status,
      created_at,
      updated_at,
      assigned_to,
      recommendation_id,
      workflow_status,
      acceptance_criteria,
      tags,
      evidence,
      workflow
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
      $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb
    )
    on conflict (id) do update set
      organization_id = excluded.organization_id,
      product_id = excluded.product_id,
      project_id = excluded.project_id,
      name = excluded.name,
      description = excluded.description,
      priority = excluded.priority,
      status = excluded.status,
      updated_at = excluded.updated_at,
      assigned_to = excluded.assigned_to,
      recommendation_id = excluded.recommendation_id,
      workflow_status = excluded.workflow_status,
      acceptance_criteria = excluded.acceptance_criteria,
      tags = excluded.tags,
      evidence = excluded.evidence,
      workflow = excluded.workflow
    returning *;
  `,
  listTasks: `
    select *
    from tasks
    order by created_at asc;
  `
};

export interface ApprovalTaskWriteContext {
  organizationId: string;
}

export interface ApprovalTaskRepository {
  source: "postgres" | "in-memory";
  table: "tasks" | null;
  save(task: Task, context: ApprovalTaskWriteContext): Promise<Task>;
  list(): Promise<Task[]>;
}

function assertRegistryProject(task: Task) {
  if (!task.projectId || task.projectId === seedProjectId) {
    throw new Error(`Durable tasks cannot use seed project id ${task.projectId ?? "missing"}.`);
  }
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asPriority(value: unknown): Priority {
  if (value === "low" || value === "medium" || value === "high" || value === "critical" || value === "urgent") return value;
  return "medium";
}

function asWorkflowStatus(value: unknown): TaskWorkflowStatus {
  if (value === "backlog" || value === "ready" || value === "in_progress" || value === "blocked" || value === "review" || value === "done") {
    return value;
  }
  return "ready";
}

function asWorkflow(value: unknown): TaskWorkflowRun | undefined {
  const record = asRecord(value);
  if (!record || record.status !== "started") return undefined;
  const evidence = asStringArray(record.evidence);
  return {
    id: String(record.id),
    name: String(record.name ?? ""),
    status: "started",
    startedAt: toIsoTimestamp(record.startedAt),
    owner: String(record.owner ?? ""),
    entryStepId: String(record.entryStepId ?? "execute-approved-recommendation"),
    evidence
  };
}

export function rowToTask(row: Record<string, unknown>): Task {
  const evidence = asStringArray(row.evidence);
  const workflow = asWorkflow(row.workflow);
  return {
    id: String(row.id),
    name: String(row.name),
    description: asOptionalString(row.description),
    status: row.status === "planned" || row.status === "active" || row.status === "paused" || row.status === "archived" ? row.status : "active",
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
    assignedTo: asOptionalString(row.assigned_to),
    productId: asOptionalString(row.product_id),
    projectId: asOptionalString(row.project_id),
    recommendationId: asOptionalString(row.recommendation_id),
    priority: asPriority(row.priority),
    workflowStatus: asWorkflowStatus(row.workflow_status),
    acceptanceCriteria: asStringArray(row.acceptance_criteria),
    tags: asStringArray(row.tags),
    evidence: evidence.length > 0 ? evidence : workflow?.evidence,
    workflow
  };
}

function taskToParams(task: Task, organizationId: string): unknown[] {
  return [
    task.id,
    organizationId,
    task.productId ?? null,
    task.projectId ?? null,
    task.name,
    task.description ?? null,
    task.priority,
    task.status,
    toIsoTimestamp(task.createdAt),
    toIsoTimestamp(task.updatedAt),
    task.assignedTo ?? null,
    task.recommendationId ?? null,
    task.workflowStatus,
    JSON.stringify(task.acceptanceCriteria ?? []),
    JSON.stringify(task.tags ?? []),
    JSON.stringify(task.evidence ?? []),
    JSON.stringify(task.workflow ?? {})
  ];
}

export function createInMemoryApprovalTaskRepository(initialTasks: Task[] = []): ApprovalTaskRepository {
  const tasks = initialTasks.map((task) => structuredClone(task));

  return {
    source: "in-memory",
    table: null,
    async save(task) {
      assertRegistryProject(task);
      const copy = structuredClone(task);
      const index = tasks.findIndex((item) => item.id === copy.id);
      if (index >= 0) tasks[index] = copy;
      else tasks.push(copy);
      return structuredClone(copy);
    },
    async list() {
      return tasks.map((task) => structuredClone(task));
    }
  };
}

export function createPostgresApprovalTaskRepository(options: { query?: PostgresQueryExecutor } = {}): ApprovalTaskRepository {
  if (!options.query) {
    return {
      source: "postgres",
      table: approvalTaskTableName,
      async save() {
        throw new Error("Postgres task adapter is configured without a query executor.");
      },
      async list() {
        throw new Error("Postgres task adapter is configured without a query executor.");
      }
    };
  }

  const query = options.query;

  return {
    source: "postgres",
    table: approvalTaskTableName,
    async save(task, context) {
      assertRegistryProject(task);
      const rows = await query<Record<string, unknown>>(postgresApprovalTaskSql.upsertTask, taskToParams(task, context.organizationId));
      return rows[0] ? rowToTask(rows[0]) : task;
    },
    async list() {
      const rows = await query<Record<string, unknown>>(postgresApprovalTaskSql.listTasks);
      return rows.map(rowToTask);
    }
  };
}

export function taskRecordSource(task: Pick<Task, "id" | "projectId">): "seed" | "durable" {
  if (task.id.startsWith("TASK-FROM-")) return "durable";
  if (!task.projectId || task.projectId === seedProjectId) return "seed";
  if (task.id === "TASK-0001" || task.id === "TASK-0002" || task.id === "TASK-0003") return "seed";
  return "durable";
}

export function presentTask(task: Task): Task {
  return {
    ...task,
    recordSource: taskRecordSource(task)
  };
}

export function taskCollectionSource(repository: Pick<ApprovalTaskRepository, "source">, durableCount: number): "postgres" | "in-memory-seed" {
  switch (repository.source) {
    case "postgres":
      return durableCount > 0 ? "postgres" : "in-memory-seed";
    case "in-memory":
      return "in-memory-seed";
    default: {
      const unreachable: never = repository.source;
      return unreachable;
    }
  }
}
