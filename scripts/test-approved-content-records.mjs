import {
  approvedContentRecordId,
  buildApprovedContentRecord,
  createInMemoryApprovedContentRepository,
  createInMemoryRepository,
  createInMemoryReviewDecisionRepository,
  createPostgresApprovedContentRepository,
  createTipApiGateway,
  createTipBootstrapSnapshot,
  postgresApprovedContentSql,
  rootWorkContentReviewWorkflowId
} from "../packages/core/src/index.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const contentHomeId = "CONTENT-FROM-CMC-EXT-ROOTWORK-HOME";
const reviewRepository = createInMemoryReviewDecisionRepository();
const contentRepository = createInMemoryApprovedContentRepository();
const gateway = createTipApiGateway({
  repository: createInMemoryRepository(createTipBootstrapSnapshot()),
  reviewDecisionRepository: reviewRepository,
  approvedContentRepository: contentRepository,
  persistenceLabel: "postgres-review-decision-repository"
});

const beforeTasks = await gateway.handleAsync({ method: "GET", path: "/v1/collections/tasks" });
assert(beforeTasks.body.every((task) => task.recordSource === "seed"), "TASK-0001..TASK-0003 must be labeled seed before approval.");
assert(beforeTasks.body.some((task) => task.id === "TASK-0001") && beforeTasks.body.some((task) => task.id === "TASK-0003"), "Seed task ids must still be listed.");

const rejected = await gateway.handleAsync({
  method: "POST",
  path: "/v1/review-queue/decisions",
  body: {
    itemId: "REV-CMC-EXT-ROOTWORK-WISDOM",
    action: "reject",
    decidedBy: "founder-proof"
  }
});
assert(rejected.status === 200 && !rejected.body.contentRecord, "Reject must not create a content record.");
assert((await contentRepository.list()).length === 0, "Reject must leave the content table empty.");

const deferred = await gateway.handleAsync({
  method: "POST",
  path: "/v1/review-queue/decisions",
  body: {
    itemId: "REV-CMC-EXT-ROOTWORK-PRACTICES",
    action: "defer",
    decidedBy: "founder-proof"
  }
});
assert(deferred.status === 200 && !deferred.body.contentRecord, "Defer must not create a content record.");

const approved = await gateway.handleAsync({
  method: "POST",
  path: "/v1/review-queue/decisions",
  body: {
    itemId: "REV-CMC-EXT-ROOTWORK-HOME",
    action: "approve",
    decidedBy: "founder-proof",
    note: "EVD-TIP-CONTENT-001"
  }
});
assert(approved.status === 200, `Content approve failed with ${approved.status}: ${approved.body?.error ?? ""}`);
assert(!approved.body.task, "Approving a content candidate must not create a task.");
assert(approved.body.contentRecord?.id === contentHomeId, "Approve must return CONTENT-FROM-CMC-EXT-ROOTWORK-HOME.");
assert(approved.body.contentRecord?.projectId === "PRJ-ROOTWORK", "Approved content must use the Registry project.");
assert(approved.body.contentRecord?.workflowId === rootWorkContentReviewWorkflowId, "Approved content must store WF-ROOTWORK-CONTENT-REVIEW.");
assert(approved.body.contentRecord?.entryStepId === "record.persist", "Approved content must store the persist step.");
assert(approved.body.contentRecord?.recordSource === "durable", "Approved content must be labeled durable.");

const duplicate = await gateway.handleAsync({
  method: "POST",
  path: "/v1/review-queue/decisions",
  body: {
    itemId: "REV-CMC-EXT-ROOTWORK-HOME",
    action: "approve",
    decidedBy: "founder-proof-again"
  }
});
assert(duplicate.body.contentRecord?.id === contentHomeId, "A second approve must return the same content id.");
assert((await contentRepository.list()).filter((row) => row.entityId === "CMC-EXT-ROOTWORK-HOME").length === 1, "One candidate approve must stay one row.");

const recommendation = await gateway.handleAsync({
  method: "POST",
  path: "/v1/review-queue/decisions",
  body: {
    itemId: "REV-REC-0002",
    action: "approve",
    decidedBy: "founder-proof"
  }
});
assert(recommendation.body.task?.id === "TASK-FROM-REC-0002", "Recommendation approve must still create TASK-FROM-REC-0002.");
assert(!recommendation.body.contentRecord, "Recommendation approve must not create a content record.");

const tasks = await gateway.handleAsync({ method: "GET", path: "/v1/collections/tasks" });
const seedTask = tasks.body.find((task) => task.id === "TASK-0001");
const durableTask = tasks.body.find((task) => task.id === "TASK-FROM-REC-0002");
assert(seedTask?.recordSource === "seed", "TASK-0001 must stay seed after a durable task exists.");
assert(durableTask?.recordSource === "durable" && durableTask.projectId === "PRJ-ROOTWORK", "TASK-FROM-REC-0002 must be labeled durable.");

const snapshot = await gateway.handleAsync({ method: "GET", path: "/v1/snapshot" });
assert(snapshot.body.tasks.find((task) => task.id === "TASK-0002")?.recordSource === "seed", "Snapshot must label TASK-0002 as seed.");
assert(snapshot.body.tasks.find((task) => task.id === "TASK-FROM-REC-0002")?.recordSource === "durable", "Snapshot must label TASK-FROM-REC-0002 as durable.");

const listed = await gateway.handleAsync({ method: "GET", path: "/v1/rootwork/approved-content" });
assert(listed.body.count === 1 && listed.body.records[0]?.id === contentHomeId, "Approved content route must return the one durable row.");
assert(listed.body.workflowId === rootWorkContentReviewWorkflowId, "Approved content route must name the RootWork workflow.");

const replayRepository = createInMemoryApprovedContentRepository();
const replayGateway = createTipApiGateway({
  repository: createInMemoryRepository(createTipBootstrapSnapshot()),
  reviewDecisionRepository: reviewRepository,
  approvedContentRepository: replayRepository
});
const replayed = await replayGateway.replayApprovedContentRecords();
assert(replayed.length === 1 && replayed[0]?.id === contentHomeId, "Restart replay must restore the one approved content row.");
const replayedAgain = await replayGateway.replayApprovedContentRecords();
assert(replayedAgain.length === 1 && (await replayRepository.list()).length === 1, "A second replay must still leave one content row.");

const healthGateway = createTipApiGateway({
  repository: createInMemoryRepository(createTipBootstrapSnapshot()),
  reviewDecisionRepository: reviewRepository,
  approvedContentRepository: replayRepository,
  persistenceLabel: "postgres-review-decision-repository"
});
await healthGateway.replayApprovedContentRecords();
const memoryHealth = await healthGateway.handleAsync({ method: "GET", path: "/health" });
assert(memoryHealth.body.persistenceMap.approvedContentRecords === "in-memory", "In-memory content rows must not be reported as the seed map.");

const rows = [];
const postgresContent = createPostgresApprovedContentRepository({
  async query(sql, params = []) {
    if (sql === postgresApprovedContentSql.listRecords) return rows;
    assert(sql === postgresApprovedContentSql.upsertRecord, "Postgres content save must use the upsert statement.");
    const row = {
      id: params[0],
      organization_id: params[1],
      product_id: params[2],
      project_id: params[3],
      review_item_id: params[4],
      entity_id: params[5],
      title: params[6],
      url: params[7],
      section: params[8],
      content_type: params[9],
      intent: params[10],
      decided_by: params[11],
      decided_at: params[12],
      workflow_id: params[13],
      entry_step_id: params[14],
      evidence: JSON.parse(String(params[15]))
    };
    const index = rows.findIndex((item) => item.id === row.id);
    if (index >= 0) rows[index] = row;
    else rows.push(row);
    return [row];
  }
});

const built = buildApprovedContentRecord({
  item: {
    id: "REV-CMC-EXT-ROOTWORK-HOME",
    type: "content_map_candidate",
    title: "RootWork Home",
    description: "Review extracted page candidate for core.",
    status: "approved",
    priority: "medium",
    source: "crawler-to-content-map",
    entityId: "CMC-EXT-ROOTWORK-HOME",
    productId: "PROD-ROOTWORK",
    recommendedAction: "Approve",
    evidence: ["Detected topic: rootwork"],
    createdAt: "2026-09-22T00:00:00.000Z"
  },
  decision: {
    decidedBy: "founder-proof",
    decidedAt: "2026-09-22T00:00:00.000Z",
    itemId: "REV-CMC-EXT-ROOTWORK-HOME"
  }
});
assert(built.id === approvedContentRecordId(built.entityId), "Content id must be derived from the entity id.");
const saved = await postgresContent.save(built, { organizationId: "ORG-TRUAXIOM" });
const savedAgain = await postgresContent.save({ ...built, title: "RootWork Home" }, { organizationId: "ORG-TRUAXIOM" });
assert(saved.id === contentHomeId && savedAgain.id === contentHomeId, "Postgres upsert must keep the same primary key.");
assert(rows.filter((row) => row.id === contentHomeId).length === 1, "Postgres upsert must not insert a second row.");
assert(postgresApprovedContentSql.upsertRecord.includes("on conflict (id) do update"), "Content SQL must upsert on id.");
assert((await postgresContent.list())[0]?.workflowId === rootWorkContentReviewWorkflowId, "Postgres readback must keep the workflow id.");

let refused = false;
try {
  await postgresContent.save({ ...built, id: "CONTENT-OTHER" }, { organizationId: "ORG-TRUAXIOM" });
} catch {
  refused = true;
}
assert(refused, "Postgres save must refuse an id that is not CONTENT-FROM-{entity id}.");

const postgresGateway = createTipApiGateway({
  repository: createInMemoryRepository(createTipBootstrapSnapshot()),
  reviewDecisionRepository: createInMemoryReviewDecisionRepository(),
  approvedContentRepository: postgresContent,
  persistenceLabel: "postgres-review-decision-repository"
});
const postgresHealth = await postgresGateway.handleAsync({ method: "GET", path: "/health" });
assert(postgresHealth.body.persistenceMap.approvedContentRecords === "postgres", "Health must report approved content as postgres once a row exists.");
assert(postgresHealth.body.approvedContentRecords?.durableCount === 1, "Health must count the one durable content row.");
assert(postgresHealth.body.persistenceMap.contentMaps === "in-memory-seed", "The seed content map must stay in memory.");

console.log("Approved content record tests passed.");
