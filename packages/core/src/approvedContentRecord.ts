import type { ContentMapCandidate } from "./contentMapCandidates";
import { registryProjectIdForRecommendation } from "./approvalTaskBridge";
import { seedProjectId } from "./postgresTaskAdapter";
import { toIsoTimestamp, type PostgresQueryExecutor } from "./postgresReviewDecisionAdapter";
import type { ReviewDecision, ReviewQueueItem } from "./reviewQueue";

export const approvedContentTableName = "approved_content_records";
export const rootWorkContentReviewWorkflowId = "WF-ROOTWORK-CONTENT-REVIEW";
export const rootWorkContentReviewPersistStepId = "record.persist";
export const rootWorkContentIntelligenceServiceId = "SVC-ROOTWORK-CONTENT-INTELLIGENCE";

export interface ApprovedContentRecord {
  id: string;
  productId: string;
  projectId: string;
  reviewItemId: string;
  entityId: string;
  title: string;
  url?: string;
  section?: string;
  contentType?: string;
  intent?: string;
  decidedBy: string;
  decidedAt: string;
  workflowId: typeof rootWorkContentReviewWorkflowId;
  entryStepId: typeof rootWorkContentReviewPersistStepId;
  evidence: string[];
  recordSource: "durable";
}

export interface ApprovedContentWriteContext {
  organizationId: string;
}

export interface ApprovedContentRepository {
  source: "postgres" | "in-memory";
  table: typeof approvedContentTableName | null;
  save(record: ApprovedContentRecord, context: ApprovedContentWriteContext): Promise<ApprovedContentRecord>;
  list(): Promise<ApprovedContentRecord[]>;
}

export const approvedContentSchemaStatements = [
  `
    create table if not exists approved_content_records (
      id text primary key,
      organization_id text not null,
      product_id text not null,
      project_id text not null,
      review_item_id text not null,
      entity_id text not null unique,
      title text not null,
      url text,
      section text,
      content_type text,
      intent text,
      decided_by text not null,
      decided_at timestamptz not null,
      workflow_id text not null,
      entry_step_id text not null,
      evidence jsonb not null default '[]'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `
];

export const postgresApprovedContentSql = {
  upsertRecord: `
    insert into approved_content_records (
      id,
      organization_id,
      product_id,
      project_id,
      review_item_id,
      entity_id,
      title,
      url,
      section,
      content_type,
      intent,
      decided_by,
      decided_at,
      workflow_id,
      entry_step_id,
      evidence,
      updated_at
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17
    )
    on conflict (id) do update set
      organization_id = excluded.organization_id,
      product_id = excluded.product_id,
      project_id = excluded.project_id,
      review_item_id = excluded.review_item_id,
      entity_id = excluded.entity_id,
      title = excluded.title,
      url = excluded.url,
      section = excluded.section,
      content_type = excluded.content_type,
      intent = excluded.intent,
      decided_by = excluded.decided_by,
      decided_at = excluded.decided_at,
      workflow_id = excluded.workflow_id,
      entry_step_id = excluded.entry_step_id,
      evidence = excluded.evidence,
      updated_at = excluded.updated_at
    returning *;
  `,
  listRecords: `
    select *
    from approved_content_records
    order by decided_at asc;
  `
};

export function approvedContentRecordId(entityId: string): string {
  return `CONTENT-FROM-${entityId}`;
}

export function buildApprovedContentRecord(input: {
  item: ReviewQueueItem;
  decision: Pick<ReviewDecision, "decidedBy" | "decidedAt" | "itemId">;
  candidate?: ContentMapCandidate;
}): ApprovedContentRecord {
  const entityId = input.item.entityId?.trim() || input.item.id;
  const productId = input.candidate?.productId ?? input.item.productId ?? "PROD-ROOTWORK";
  const projectId = registryProjectIdForRecommendation({ productId });
  const evidenceLink = `/v1/review-queue/decisions#${input.decision.itemId}`;

  return {
    id: approvedContentRecordId(entityId),
    productId,
    projectId,
    reviewItemId: input.item.id,
    entityId,
    title: input.candidate?.title ?? input.item.title,
    url: input.candidate?.url,
    section: input.candidate?.proposedSection,
    contentType: input.candidate?.proposedType,
    intent: input.candidate?.proposedIntent,
    decidedBy: input.decision.decidedBy,
    decidedAt: toIsoTimestamp(input.decision.decidedAt),
    workflowId: rootWorkContentReviewWorkflowId,
    entryStepId: rootWorkContentReviewPersistStepId,
    evidence: [...new Set([...input.item.evidence, evidenceLink])],
    recordSource: "durable"
  };
}

function assertDurableContentIdentity(record: ApprovedContentRecord) {
  const entityId = record.entityId.trim();
  const expectedId = approvedContentRecordId(entityId);
  if (!entityId || record.id !== expectedId) {
    throw new Error(`Approved content id must be ${expectedId}.`);
  }
  if (!record.projectId || record.projectId === seedProjectId) {
    throw new Error(`Durable content records cannot use seed project id ${record.projectId || "missing"}.`);
  }
  if (record.workflowId !== rootWorkContentReviewWorkflowId) {
    throw new Error(`Approved content records must use workflow ${rootWorkContentReviewWorkflowId}.`);
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

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function rowToApprovedContentRecord(row: Record<string, unknown>): ApprovedContentRecord {
  return {
    id: String(row.id),
    productId: String(row.product_id),
    projectId: String(row.project_id),
    reviewItemId: String(row.review_item_id),
    entityId: String(row.entity_id),
    title: String(row.title),
    url: asOptionalString(row.url),
    section: asOptionalString(row.section),
    contentType: asOptionalString(row.content_type),
    intent: asOptionalString(row.intent),
    decidedBy: String(row.decided_by),
    decidedAt: toIsoTimestamp(row.decided_at),
    workflowId: rootWorkContentReviewWorkflowId,
    entryStepId: rootWorkContentReviewPersistStepId,
    evidence: asStringArray(row.evidence),
    recordSource: "durable"
  };
}

function recordToParams(record: ApprovedContentRecord, organizationId: string): unknown[] {
  return [
    record.id,
    organizationId,
    record.productId,
    record.projectId,
    record.reviewItemId,
    record.entityId,
    record.title,
    record.url ?? null,
    record.section ?? null,
    record.contentType ?? null,
    record.intent ?? null,
    record.decidedBy,
    toIsoTimestamp(record.decidedAt),
    record.workflowId,
    record.entryStepId,
    JSON.stringify(record.evidence),
    toIsoTimestamp(record.decidedAt)
  ];
}

export function createInMemoryApprovedContentRepository(initialRecords: ApprovedContentRecord[] = []): ApprovedContentRepository {
  const records = initialRecords.map((record) => structuredClone(record));

  return {
    source: "in-memory",
    table: null,
    async save(record) {
      assertDurableContentIdentity(record);
      const copy = structuredClone(record);
      const index = records.findIndex((item) => item.id === copy.id || item.entityId === copy.entityId);
      if (index >= 0) records[index] = copy;
      else records.push(copy);
      return structuredClone(copy);
    },
    async list() {
      return records.map((record) => structuredClone(record));
    }
  };
}

export function createPostgresApprovedContentRepository(options: { query?: PostgresQueryExecutor } = {}): ApprovedContentRepository {
  if (!options.query) {
    return {
      source: "postgres",
      table: approvedContentTableName,
      async save() {
        throw new Error("Postgres approved-content adapter is configured without a query executor.");
      },
      async list() {
        throw new Error("Postgres approved-content adapter is configured without a query executor.");
      }
    };
  }

  const query = options.query;

  return {
    source: "postgres",
    table: approvedContentTableName,
    async save(record, context) {
      assertDurableContentIdentity(record);
      const rows = await query<Record<string, unknown>>(postgresApprovedContentSql.upsertRecord, recordToParams(record, context.organizationId));
      return rows[0] ? rowToApprovedContentRecord(rows[0]) : record;
    },
    async list() {
      const rows = await query<Record<string, unknown>>(postgresApprovedContentSql.listRecords);
      return rows.map(rowToApprovedContentRecord);
    }
  };
}

export function approvedContentCollectionSource(
  repository: Pick<ApprovedContentRepository, "source">,
  durableCount: number
): "postgres" | "in-memory" | "in-memory-seed" {
  switch (repository.source) {
    case "postgres":
      return durableCount > 0 ? "postgres" : "in-memory-seed";
    case "in-memory":
      return durableCount > 0 ? "in-memory" : "in-memory-seed";
    default: {
      const unreachable: never = repository.source;
      return unreachable;
    }
  }
}
