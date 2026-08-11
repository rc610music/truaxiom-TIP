import type { ReviewDecision } from "./reviewQueue";
import type { ReviewDecisionRepository } from "./reviewDecisionRepository";

export type PostgresQueryExecutor = <T = unknown>(sql: string, params?: unknown[]) => Promise<T[]>;

export interface PostgresReviewDecisionAdapterOptions {
  connectionString?: string;
  query?: PostgresQueryExecutor;
  provider?: "neon" | "supabase" | "postgres";
}

export const reviewDecisionTableName = "review_decisions";

export const postgresReviewDecisionSql = {
  insertDecision: `
    insert into review_decisions (
      id,
      queue_id,
      item_id,
      action,
      decided_by,
      note,
      decided_at,
      previous_status,
      next_status,
      metadata
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
    on conflict (id) do update set
      queue_id = excluded.queue_id,
      item_id = excluded.item_id,
      action = excluded.action,
      decided_by = excluded.decided_by,
      note = excluded.note,
      decided_at = excluded.decided_at,
      previous_status = excluded.previous_status,
      next_status = excluded.next_status,
      metadata = excluded.metadata
    returning *;
  `,
  listDecisions: `
    select *
    from review_decisions
    where ($1::text is null or queue_id = $1)
    order by decided_at desc;
  `,
  findDecision: `
    select *
    from review_decisions
    where id = $1
    limit 1;
  `
};

function rowToReviewDecision(row: Record<string, unknown>): ReviewDecision {
  return {
    id: String(row.id),
    queueId: String(row.queue_id),
    itemId: String(row.item_id),
    action: row.action as ReviewDecision["action"],
    decidedBy: String(row.decided_by),
    note: typeof row.note === "string" ? row.note : undefined,
    decidedAt: String(row.decided_at),
    previousStatus: row.previous_status as ReviewDecision["previousStatus"],
    nextStatus: row.next_status as ReviewDecision["nextStatus"]
  };
}

function decisionToParams(decision: ReviewDecision) {
  return [
    decision.id,
    decision.queueId,
    decision.itemId,
    decision.action,
    decision.decidedBy,
    decision.note ?? null,
    decision.decidedAt,
    decision.previousStatus,
    decision.nextStatus,
    JSON.stringify({ source: "tip-review-decision-adapter" })
  ];
}

export function createPostgresReviewDecisionRepository(options: PostgresReviewDecisionAdapterOptions = {}): ReviewDecisionRepository {
  if (!options.query) {
    return {
      async recordDecision() {
        throw new Error("Postgres review decision adapter is configured without a query executor.");
      },
      async listDecisions() {
        throw new Error("Postgres review decision adapter is configured without a query executor.");
      },
      async findDecision() {
        throw new Error("Postgres review decision adapter is configured without a query executor.");
      }
    };
  }

  const query = options.query;

  return {
    async recordDecision(decision) {
      const rows = await query<Record<string, unknown>>(postgresReviewDecisionSql.insertDecision, decisionToParams(decision));
      return rows[0] ? rowToReviewDecision(rows[0]) : decision;
    },

    async listDecisions(queueId) {
      const rows = await query<Record<string, unknown>>(postgresReviewDecisionSql.listDecisions, [queueId ?? null]);
      return rows.map(rowToReviewDecision);
    },

    async findDecision(id) {
      const rows = await query<Record<string, unknown>>(postgresReviewDecisionSql.findDecision, [id]);
      return rows[0] ? rowToReviewDecision(rows[0]) : undefined;
    }
  };
}

export function describePostgresReviewDecisionAdapter(options: PostgresReviewDecisionAdapterOptions = {}): string[] {
  const provider = options.provider ?? "postgres";
  return [
    `Review decisions are prepared for ${provider} Postgres persistence.`,
    "Use DATABASE_URL or NEON_DATABASE_URL for Neon now; Supabase can use the same Postgres-shaped adapter later.",
    "The adapter is inactive until a query executor is supplied by the runtime."
  ];
}
