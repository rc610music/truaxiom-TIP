import {
  buildTaskFromApprovedRecommendation,
  createInMemoryRepository,
  createInMemoryReviewDecisionRepository,
  createPostgresApprovalTaskRepository,
  createTipApiGateway,
  createTipBootstrapSnapshot,
  postgresApprovalTaskSql,
  recommendations,
  registryProjectIdForRecommendation
} from "../packages/core/src/index.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const recommendationTip = recommendations.find((item) => item.id === "REC-0001");
const recommendationRootWork = recommendations.find((item) => item.id === "REC-0002");

assert(recommendationTip && recommendationRootWork, "Seed recommendations REC-0001 and REC-0002 are required.");
assert(registryProjectIdForRecommendation(recommendationTip) === "PRJ-TIP", "REC-0001 must map to PRJ-TIP.");
assert(registryProjectIdForRecommendation(recommendationRootWork) === "PRJ-ROOTWORK", "REC-0002 must map to PRJ-ROOTWORK.");
assert(recommendationTip.projectId === "PRJ-SPRINT-002", "Seed recommendation still carries PRJ-SPRINT-002 before the bridge.");

const gateway = createTipApiGateway({
  repository: createInMemoryRepository(createTipBootstrapSnapshot()),
  modeLabel: "api",
  persistenceLabel: "in-memory-review-decision-repository"
});

const before = await gateway.handleAsync({ method: "GET", path: "/v1/collections/tasks" });
assert(Array.isArray(before.body), "Task collection must be an array.");
assert(before.body.every((task) => String(task.id).startsWith("TASK-000")), "Tasks before approval stay on the seed ids.");

const approved = await gateway.handleAsync({
  method: "POST",
  path: "/v1/review-queue/decisions",
  body: {
    itemId: "REV-REC-0002",
    action: "approve",
    decidedBy: "founder-proof",
    note: "EVD-TIP-LOOP-001"
  }
});

assert(approved.status === 200, `Approve failed with ${approved.status}.`);
const task = approved.body.task;
assert(task?.id === "TASK-FROM-REC-0002", "Approve must create TASK-FROM-REC-0002.");
assert(task.projectId === "PRJ-ROOTWORK", "REC-0002 must be stored on PRJ-ROOTWORK.");
assert(task.productId === "PROD-ROOTWORK", "REC-0002 must keep PROD-ROOTWORK.");
assert(task.assignedTo === "founder-proof", "Approved task must keep the decision owner.");
assert(task.workflowStatus === "in_progress", "Approved task workflow must be in progress.");
assert(task.workflow?.status === "started", "Approved task must store a started workflow.");
assert(task.workflow?.id === "WF-TASK-FROM-REC-0002", "Workflow id must be derived from the task id.");
assert(task.workflow?.owner === "founder-proof", "Workflow owner must match the decision.");
assert(Array.isArray(task.evidence) && task.evidence.some((item) => String(item).includes("REV-REC-0002")), "Task evidence must link the review decision.");
assert(task.projectId !== "PRJ-SPRINT-002", "Durable task must not keep the seed project id.");
assert(approved.body.decision?.itemId === "REV-REC-0002", "Review decision path must still record the approved item.");

const listed = await gateway.handleAsync({ method: "GET", path: "/v1/collections/tasks" });
const found = listed.body.find((item) => item.id === "TASK-FROM-REC-0002");
assert(found?.projectId === "PRJ-ROOTWORK" && found.workflowStatus === "in_progress", "GET /v1/collections/tasks must return the durable task.");

const snapshot = await gateway.handleAsync({ method: "GET", path: "/v1/snapshot" });
assert(
  snapshot.body.tasks?.some((item) => item.id === "TASK-FROM-REC-0002" && item.projectId === "PRJ-ROOTWORK"),
  "Snapshot tasks must include the approved task."
);

const queue = await gateway.handleAsync({ method: "GET", path: "/v1/review-queue" });
const nonRecommendation = queue.body.queue?.items?.find((item) => item.type !== "recommendation" && item.status === "needs_review");
assert(nonRecommendation?.id, "Review queue must still contain a non-recommendation item.");
const gapDecision = await gateway.handleAsync({
  method: "POST",
  path: "/v1/review-queue/decisions",
  body: {
    itemId: nonRecommendation.id,
    action: "approve",
    decidedBy: "founder-proof"
  }
});
assert(gapDecision.status === 200 && !gapDecision.body.task, "Approving a non-recommendation must not create a task.");

const deferred = await gateway.handleAsync({
  method: "POST",
  path: "/v1/review-queue/decisions",
  body: {
    itemId: "REV-REC-0001",
    action: "defer",
    decidedBy: "founder-proof"
  }
});
assert(deferred.status === 200 && !deferred.body.task, "Defer must not create a task.");

const tipApproved = await gateway.handleAsync({
  method: "POST",
  path: "/v1/review-queue/decisions",
  body: {
    itemId: "REV-REC-0001",
    action: "approve",
    decidedBy: "founder-proof"
  }
});
assert(tipApproved.body.task?.id === "TASK-FROM-REC-0001", "REC-0001 approval must create TASK-FROM-REC-0001.");
assert(tipApproved.body.task?.projectId === "PRJ-TIP", "REC-0001 must be stored on PRJ-TIP.");

const replayGateway = createTipApiGateway({
  repository: createInMemoryRepository(createTipBootstrapSnapshot()),
  reviewDecisionRepository: createInMemoryReviewDecisionRepository([{
    id: "RDEC-REPLAY-REC-0002",
    queueId: "REVQ-MISSION-CONTROL-SPRINT-002",
    itemId: "REV-REC-0002",
    action: "approve",
    resultingStatus: "approved",
    decidedBy: "founder-replay",
    decidedAt: "2026-09-21T00:00:00.000Z",
    mode: "persistent"
  }])
});
const replayed = await replayGateway.replayApprovedRecommendationTasks();
assert(replayed.length === 1, "Replay must create one task for the approved recommendation.");
assert(replayed[0]?.projectId === "PRJ-ROOTWORK" && replayed[0]?.assignedTo === "founder-replay", "Replay must keep the Registry project and owner.");
assert(replayed[0]?.workflow?.status === "started", "Replay must start the workflow.");

const rows = [];
const executed = [];
const postgresTasks = createPostgresApprovalTaskRepository({
  async query(sql, params = []) {
    executed.push({ sql, params });
    if (sql === postgresApprovalTaskSql.listTasks) return rows;

    const row = {
      id: params[0],
      organization_id: params[1],
      product_id: params[2],
      project_id: params[3],
      name: params[4],
      description: params[5],
      priority: params[6],
      status: params[7],
      created_at: params[8],
      updated_at: params[9],
      assigned_to: params[10],
      recommendation_id: params[11],
      workflow_status: params[12],
      acceptance_criteria: JSON.parse(String(params[13])),
      tags: JSON.parse(String(params[14])),
      evidence: JSON.parse(String(params[15])),
      workflow: JSON.parse(String(params[16]))
    };
    const index = rows.findIndex((item) => item.id === row.id);
    if (index >= 0) rows[index] = row;
    else rows.push(row);
    return [row];
  }
});

const built = buildTaskFromApprovedRecommendation(recommendationRootWork, {
  decidedBy: "founder-proof",
  decidedAt: "2026-09-21T00:00:00.000Z",
  itemId: "REV-REC-0002"
});
const saved = await postgresTasks.save(built, { organizationId: "ORG-TRUAXIOM" });
assert(saved.projectId === "PRJ-ROOTWORK", "Postgres readback must keep PRJ-ROOTWORK.");
assert(executed[0]?.params?.[3] === "PRJ-ROOTWORK", "Postgres insert must bind the Registry project id.");
assert(!executed[0]?.params?.includes("PRJ-SPRINT-002"), "Postgres parameters must not include PRJ-SPRINT-002.");
assert(postgresApprovalTaskSql.upsertTask.includes("$17::jsonb"), "Task upsert must persist workflow JSON.");
assert((await postgresTasks.list())[0]?.workflow?.status === "started", "Postgres list must return the started workflow.");

let refusedSeedProject = false;
try {
  await postgresTasks.save({ ...built, projectId: "PRJ-SPRINT-002" }, { organizationId: "ORG-TRUAXIOM" });
} catch {
  refusedSeedProject = true;
}
assert(refusedSeedProject, "Postgres save must refuse PRJ-SPRINT-002.");

const postgresGateway = createTipApiGateway({
  repository: createInMemoryRepository(createTipBootstrapSnapshot()),
  approvalTaskRepository: postgresTasks,
  persistenceLabel: "postgres-review-decision-repository",
  registryMeta: {
    version: "v1",
    source: "postgres",
    configuredProvider: "postgres"
  }
});
const health = await postgresGateway.handleAsync({ method: "GET", path: "/health" });
assert(health.body.persistenceMap?.tasks === "postgres", "Health must report postgres tasks when durable rows exist.");
assert(health.body.summarySources?.[4] === "postgres", "summarySources task line must follow the durable task store.");
assert(health.body.tasks?.table === "tasks" && health.body.tasks?.durableCount >= 1, "Health must name the tasks table and count.");
assert(health.body.reviewDecisions?.table === "tip_review_decisions", "Review decision health block must stay intact.");

const postgresCollection = await postgresGateway.handleAsync({ method: "GET", path: "/v1/collections/tasks" });
assert(
  postgresCollection.body.some((item) => item.id === "TASK-FROM-REC-0002" && item.projectId === "PRJ-ROOTWORK"),
  "Postgres-backed collection must return the approved task."
);

const emptyPostgres = createPostgresApprovalTaskRepository({
  async query() {
    return [];
  }
});
const emptyHealth = await createTipApiGateway({
  approvalTaskRepository: emptyPostgres,
  persistenceLabel: "postgres-review-decision-repository",
  registryMeta: {
    version: "v1",
    source: "postgres",
    configuredProvider: "postgres"
  }
}).handleAsync({ method: "GET", path: "/health" });
assert(emptyHealth.body.persistenceMap?.tasks === "in-memory-seed", "Empty tasks table must keep the seed source label.");

console.log("TIP approval task bridge test passed.");
console.log(JSON.stringify({
  taskId: task.id,
  projectId: task.projectId,
  owner: task.assignedTo,
  workflowId: task.workflow.id,
  workflowStatus: task.workflow.status,
  evidence: task.evidence
}, null, 2));
