import {
  createPostgresReviewDecisionRepository,
  postgresReviewDecisionSql
} from "../packages/core/src/postgresReviewDecisionAdapter.ts";

const executed = [];
const repository = createPostgresReviewDecisionRepository({
  provider: "neon",
  async query(sql, params = []) {
    executed.push({ sql, params });
    return [{
      id: params[0],
      queue_id: params[1],
      item_id: params[2],
      action: params[3],
      decided_by: params[4],
      note: params[5],
      decided_at: params[6],
      resulting_status: params[7],
      mode: params[8]
    }];
  }
});

const decision = {
  id: "RDEC-TEST",
  queueId: "REVQ-TEST",
  itemId: "REV-TEST",
  action: "defer",
  decidedBy: "adapter-test",
  note: "Verifies the SQL and parameter contract.",
  decidedAt: "2026-09-08T00:00:00.000Z",
  resultingStatus: "deferred",
  mode: "persistent"
};

await repository.recordDecision(decision);

if (!postgresReviewDecisionSql.insertDecision.includes("$10::jsonb")) {
  throw new Error("Postgres decision INSERT must bind metadata as parameter $10.");
}

if (executed[0]?.params.length !== 10) {
  throw new Error(`Expected 10 decision parameters, received ${executed[0]?.params.length ?? 0}.`);
}

console.log("TIP Postgres adapter contract test passed.");
